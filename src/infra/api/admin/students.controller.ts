import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppConfigService } from '../../../config/config.service';
import { globalConfig } from '../../../config/global.config';
import { AdminRole } from '../../../domain/admins/admin.entity';
import { FlagsService } from '../../../domain/flags/flags.service';
import { GroupsService } from '../../../domain/groups/groups.service';
import { MembershipService } from '../../../domain/membership/membership.service';
import { recentWeekStarts } from '../../../domain/norms/week';
import { ReportsService } from '../../../domain/reports/reports.service';
import { healthOf, silentDays } from '../../../domain/students/health';
import { displayNameOf } from '../../../domain/students/name-validation';
import { Student } from '../../../domain/students/student.entity';
import { ArchiveReason, StudentStatus } from '../../../domain/students/student.enums';
import { StudentsService } from '../../../domain/students/students.service';
import { WordsService } from '../../../domain/words/words.service';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentPrincipal, Principal, Roles } from '../auth/principal';
import { ListQueryDto } from '../me/dto';
import { reportView, weekView, wordView } from '../me/serializers';
import { RenameStudentDto, StudentsQueryDto } from './dto';
import { AdminScope, AdminScopeService } from './scope';
import { flagView, GroupRef, studentDetail, studentRow } from './serializers';

/** 12 · Студенты — list with health and norms, one student's card, owner actions. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(AdminRole.OWNER, AdminRole.TEACHER)
@Controller('admin/students')
export class AdminStudentsController {
  constructor(
    private readonly scope: AdminScopeService,
    private readonly students: StudentsService,
    private readonly groups: GroupsService,
    private readonly reports: ReportsService,
    private readonly flags: FlagsService,
    private readonly words: WordsService,
    private readonly membership: MembershipService,
    private readonly config: AppConfigService,
  ) {}

  private async groupRefs(ids: string[]): Promise<(id: string) => GroupRef[]> {
    const [all, byStudent] = await Promise.all([
      this.groups.findAllActive(),
      this.students.memberGroupIdsFor(ids),
    ]);
    const title = new Map(all.map((g) => [g.chatId, g.title]));
    return (id) =>
      (byStudent.get(id) ?? [])
        .filter((chatId) => title.has(chatId))
        .map((chatId) => ({ chatId, title: title.get(chatId) as string }));
  }

  @Get()
  @ApiOperation({
    summary: 'Students in scope with health, silence, this week, vocabulary and new flags',
  })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() q: StudentsQueryDto,
  ): Promise<Record<string, unknown>[]> {
    const scope = await this.scope.resolve(principal);
    const now = new Date();
    const statuses = q.status ? [q.status] : [StudentStatus.ACTIVE, StudentStatus.PENDING_NAME];
    let students = await this.scope.visibleStudents(scope, statuses);
    const ids = students.map((s) => s.id);
    const [refs, counts, wordCounts, newFlags] = await Promise.all([
      this.groupRefs(ids),
      this.reports.countsByWeek(ids, recentWeekStarts(now, this.config.timezone, 1)),
      this.words.countsFor(ids),
      this.flags.countNewByStudent(scope.isOwner ? null : ids),
    ]);
    const week = recentWeekStarts(now, this.config.timezone, 1)[0];
    if (q.groupChatId !== undefined) {
      const chatId = q.groupChatId;
      students = students.filter((s) => refs(s.id).some((g) => g.chatId === chatId));
    }
    if (q.q) {
      const needle = q.q.trim().toLowerCase();
      students = students.filter(
        (s) =>
          displayNameOf(s).toLowerCase().includes(needle) ||
          (s.username ?? '').toLowerCase().includes(needle),
      );
    }
    const rows = students.map((s) => {
      const c = counts.get(`${s.id}|${week}`) ?? { reading: 0, listening: 0 };
      return studentRow(s, refs(s.id), {
        health: healthOf(s, now),
        silentDays: silentDays(s, now),
        week: {
          ...c,
          readingNorm: globalConfig.norms.readingPerWeek,
          listeningNorm: globalConfig.norms.listeningPerWeek,
        },
        words: wordCounts.get(s.id) ?? { total: 0, learned: 0 },
        newFlags: newFlags.get(s.id) ?? 0,
      });
    });
    const rank = { bad: 0, warn: 1, good: 2 };
    return rows
      .filter((r) => !q.health || r.health === q.health)
      .sort(
        (a, b) =>
          rank[a.health as keyof typeof rank] - rank[b.health as keyof typeof rank] ||
          (b.silentDays as number) - (a.silentDays as number),
      );
  }

  private async card(scope: AdminScope, student: Student): Promise<Record<string, unknown>> {
    const now = new Date();
    const refs = await this.groupRefs([student.id]);
    const [calendar, flags, summary, recent] = await Promise.all([
      this.reports.calendar(student.id, 6, now, this.config.timezone),
      this.flags.list({ studentId: student.id, limit: 50 }),
      this.words.summary(student.id),
      this.reports.history(student.id, 10),
    ]);
    const reportsById = new Map(recent.map((r) => [r.id, r]));
    return {
      student: studentDetail(student, refs(student.id), {
        health: healthOf(student, now),
        silentDays: silentDays(student, now),
      }),
      calendar: calendar.map(weekView),
      words: summary,
      flags: flags.map((f) =>
        flagView(f, null, [], f.reportId ? (reportsById.get(f.reportId) ?? null) : null),
      ),
      recentReports: recent.map(reportView),
      canEdit: scope.isOwner,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: "One student's card: profile, 6-week calendar, flags, vocabulary, recent reports",
  })
  async one(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    const scope = await this.scope.resolve(principal);
    return this.card(scope, await this.scope.student(scope, id));
  }

  @Get(':id/reports')
  @ApiOperation({ summary: 'Report history of a student, newest first (cursor = createdAt)' })
  async reportsOf(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ListQueryDto,
  ): Promise<{ data: unknown[]; meta: { nextCursor: string | null } }> {
    const scope = await this.scope.resolve(principal);
    const student = await this.scope.student(scope, id);
    const limit = q.limit ?? 20;
    const rows = await this.reports.history(
      student.id,
      limit,
      q.cursor ? new Date(q.cursor) : undefined,
    );
    return {
      data: rows.map((r) => ({ ...reportView(r), rawText: r.rawText, isForwarded: r.isForwarded })),
      meta: {
        nextCursor: rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null,
      },
    };
  }

  @Get(':id/words')
  @ApiOperation({ summary: "A student's vocabulary (latest 100)" })
  async wordsOf(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>[]> {
    const scope = await this.scope.resolve(principal);
    const student = await this.scope.student(scope, id);
    return (await this.words.search(student.id, { limit: 100 })).map(wordView);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Owner: rename (display name shown everywhere; empty = real name)' })
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameStudentDto,
  ): Promise<Record<string, unknown>> {
    const scope = await this.scope.resolve(principal);
    this.scope.assertOwner(scope);
    const student = await this.scope.student(scope, id);
    const name = dto.displayName?.trim() || null;
    await this.students.setDisplayName(student.id, name);
    return this.card(scope, await this.students.getById(student.id));
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Owner: archive ("delete") — history is kept, access is closed' })
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    const scope = await this.scope.resolve(principal);
    this.scope.assertOwner(scope);
    const student = await this.scope.student(scope, id);
    return this.card(scope, await this.students.archive(student, ArchiveReason.MANUAL));
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Owner: restore an archived student' })
  async restore(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    const scope = await this.scope.resolve(principal);
    this.scope.assertOwner(scope);
    const student = await this.students.getById(id);
    return this.card(scope, await this.students.restore(student));
  }

  @Post(':id/recheck')
  @ApiOperation({
    summary: 'Re-check group membership of one student right now (archive / restore / level)',
  })
  async recheck(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    const scope = await this.scope.resolve(principal);
    const student = await this.scope.student(scope, id);
    const outcome = await this.membership.reconcile(student);
    return {
      action: outcome.action,
      levelChanged: outcome.levelChanged,
      failedGroups: outcome.failedGroups.map((g) => g.chatId),
      ...(await this.card(scope, outcome.student)),
    };
  }
}
