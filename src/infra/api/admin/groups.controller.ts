import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../../common/codes';
import { AppError } from '../../../common/errors';
import { AppConfigService } from '../../../config/config.service';
import { globalConfig } from '../../../config/global.config';
import { Throttle } from '@nestjs/throttler';
import { AccessService } from '../../../domain/admins/access.service';
import { AdminRole } from '../../../domain/admins/admin.entity';
import { SchoolChatService } from '../../../domain/ai/school-chat.service';
import { FlagsService } from '../../../domain/flags/flags.service';
import { Group, groupTitle } from '../../../domain/groups/group.entity';
import { GroupsService } from '../../../domain/groups/groups.service';
import { MembershipService } from '../../../domain/membership/membership.service';
import { recentWeekStarts } from '../../../domain/norms/week';
import { ReportsService } from '../../../domain/reports/reports.service';
import { healthOf, silentDays } from '../../../domain/students/health';
import { displayNameOf } from '../../../domain/students/name-validation';
import { Student } from '../../../domain/students/student.entity';
import { StudentStatus } from '../../../domain/students/student.enums';
import { StudentsService } from '../../../domain/students/students.service';
import { WordsService } from '../../../domain/words/words.service';
import { MembershipCron } from '../../scheduler/membership.cron';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentPrincipal, Principal, Roles } from '../auth/principal';
import { GroupPatchDto, SchoolChatDto } from './dto';
import { AdminScope, AdminScopeService } from './scope';
import { groupView, membershipCheckView, studentRef, studentRow } from './serializers';

/** 14 · Группы — levels, teachers, membership checks. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(AdminRole.OWNER, AdminRole.TEACHER)
@Controller('admin')
export class AdminGroupsController {
  private readonly logger = new Logger(AdminGroupsController.name);
  private checkRunning = false;

  constructor(
    private readonly scope: AdminScopeService,
    private readonly groups: GroupsService,
    private readonly students: StudentsService,
    private readonly reports: ReportsService,
    private readonly access: AccessService,
    private readonly membership: MembershipService,
    private readonly cron: MembershipCron,
    private readonly config: AppConfigService,
    private readonly flags: FlagsService,
    private readonly words: WordsService,
    private readonly chat: SchoolChatService,
  ) {}

  /** The group the caller may see, or 404 / 403. */
  private async visibleGroup(scope: AdminScope, chatId: number): Promise<Group> {
    const group = await this.groups.findById(chatId);
    if (!group) throw notFound(chatId);
    this.scope.assertGroup(scope, chatId);
    return group;
  }

  @Get('groups/:chatId')
  @ApiOperation({
    summary:
      'D12: one group — members with health and the week, pending registrations, norm rates of this and last week, new flags',
  })
  async one(
    @CurrentPrincipal() principal: Principal,
    @Param('chatId', ParseIntPipe) chatId: number,
  ): Promise<Record<string, unknown>> {
    const scope = await this.scope.resolve(principal);
    const group = await this.visibleGroup(scope, chatId);
    const now = new Date();
    const weeks = recentWeekStarts(now, this.config.timezone, 2);
    const [week, previous] = weeks;
    const everyone = await this.students.findByGroups([chatId]);
    const active = everyone.filter((s) => s.status === StudentStatus.ACTIVE);
    const pending = everyone.filter((s) => s.status === StudentStatus.PENDING_NAME);
    const ids = active.map((s) => s.id);
    const [counts, totals, wordCounts, newFlags, staff, allGroups, byStudent] = await Promise.all([
      this.reports.countsByWeek(ids, weeks),
      this.reports.totalsByWeek(ids, [week]),
      this.words.countsFor(ids),
      this.flags.countNewByStudent(ids),
      this.access.listStaff(),
      this.groups.findAllActive(),
      this.students.memberGroupIdsFor(ids),
    ]);
    const titles = new Map(allGroups.map((g) => [g.chatId, groupTitle(g)]));
    const refsOf = (id: string): Array<{ chatId: number; title: string }> =>
      (byStudent.get(id) ?? [])
        .filter((c) => titles.has(c))
        .map((c) => ({ chatId: c, title: titles.get(c) as string }));
    const norms = globalConfig.norms;
    const cell = (id: string, w: string): { reading: number; listening: number } =>
      counts.get(`${id}|${w}`) ?? { reading: 0, listening: 0 };
    const rate = (w: string, pick: 'reading' | 'listening'): number => {
      if (ids.length === 0) return 0;
      const norm = pick === 'reading' ? norms.readingPerWeek : norms.listeningPerWeek;
      return (
        Math.round((ids.filter((id) => cell(id, w)[pick] >= norm).length / ids.length) * 100) / 100
      );
    };
    let reportsThisWeek = 0;
    for (const id of ids) {
      const t = totals.get(`${id}|${week}`);
      reportsThisWeek += (t?.reading ?? 0) + (t?.listening ?? 0);
    }
    const rank = { bad: 0, warn: 1, good: 2 };
    const members = active
      .map((s: Student) =>
        studentRow(s, refsOf(s.id), {
          health: healthOf(s, now),
          silentDays: silentDays(s, now),
          week: {
            ...cell(s.id, week),
            readingNorm: norms.readingPerWeek,
            listeningNorm: norms.listeningPerWeek,
          },
          words: wordCounts.get(s.id) ?? { total: 0, learned: 0 },
          newFlags: newFlags.get(s.id) ?? 0,
        }),
      )
      .sort(
        (a, b) =>
          rank[a.health as keyof typeof rank] - rank[b.health as keyof typeof rank] ||
          (b.silentDays as number) - (a.silentDays as number) ||
          String(a.name).localeCompare(String(b.name)),
      );
    const staffName = new Map(staff.map((s) => [s.telegramUserId, s.name]));
    let flagsTotal = 0;
    for (const n of newFlags.values()) flagsTotal += n;
    return {
      group: groupView(group, {
        members: active.length,
        teachers: group.teacherTelegramIds.map((id) => ({
          telegramUserId: id,
          name: staffName.get(id) ?? null,
        })),
        week: {
          reading: rate(week, 'reading'),
          listening: rate(week, 'listening'),
          students: ids.length,
        },
      }),
      stats: {
        weekStart: week,
        members: active.length,
        pending: pending.length,
        archived: everyone.filter((s) => s.status === StudentStatus.ARCHIVED).length,
        week: { reading: rate(week, 'reading'), listening: rate(week, 'listening') },
        lastWeek: { reading: rate(previous, 'reading'), listening: rate(previous, 'listening') },
        reportsThisWeek,
        newFlags: flagsTotal,
        health: {
          good: members.filter((m) => m.health === 'good').length,
          warn: members.filter((m) => m.health === 'warn').length,
          bad: members.filter((m) => m.health === 'bad').length,
        },
      },
      members,
      pending: pending
        .sort((a, b) => displayNameOf(a).localeCompare(displayNameOf(b)))
        .map((s) => studentRef(s, refsOf(s.id))),
    };
  }

  @Post('groups/:chatId/chat')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'D12: the school AI narrowed to one group — who lags, how the week went, what to say in the chat',
  })
  async ask(
    @CurrentPrincipal() principal: Principal,
    @Param('chatId', ParseIntPipe) chatId: number,
    @Body() dto: SchoolChatDto,
  ): Promise<{ text: string }> {
    const scope = await this.scope.resolve(principal);
    await this.visibleGroup(scope, chatId);
    const members = await this.students.findByGroups([chatId]);
    return this.chat.ask(
      {
        studentIds: members.filter((s) => s.status === StudentStatus.ACTIVE).map((s) => s.id),
        groupIds: [chatId],
      },
      dto.question,
      dto.history ?? [],
    );
  }

  @Get('groups')
  @ApiOperation({ summary: 'Groups in scope: level, teachers, members, this-week norm rates' })
  async list(@CurrentPrincipal() principal: Principal): Promise<Record<string, unknown>[]> {
    const scope = await this.scope.resolve(principal);
    const now = new Date();
    const week = recentWeekStarts(now, this.config.timezone, 1)[0];
    const [groups, staff, active] = await Promise.all([
      this.scope.visibleGroups(scope),
      this.access.listStaff(),
      this.scope.visibleStudents(scope, [StudentStatus.ACTIVE]),
    ]);
    const ids = active.map((s) => s.id);
    const [byStudent, counts, memberCounts] = await Promise.all([
      this.students.memberGroupIdsFor(ids),
      this.reports.countsByWeek(ids, [week]),
      this.students.memberCountsByGroup(),
    ]);
    const staffName = new Map(staff.map((s) => [s.telegramUserId, s.name]));
    const norms = globalConfig.norms;
    return groups.map((g) => {
      const members = active.filter((s) => (byStudent.get(s.id) ?? []).includes(g.chatId));
      const met = (pick: 'reading' | 'listening'): number => {
        if (members.length === 0) return 0;
        const norm = pick === 'reading' ? norms.readingPerWeek : norms.listeningPerWeek;
        const n = members.filter(
          (m) => (counts.get(`${m.id}|${week}`)?.[pick] ?? 0) >= norm,
        ).length;
        return Math.round((n / members.length) * 100) / 100;
      };
      return groupView(g, {
        members: memberCounts.get(g.chatId) ?? members.length,
        teachers: g.teacherTelegramIds.map((id) => ({
          telegramUserId: id,
          name: staffName.get(id) ?? null,
        })),
        week: { reading: met('reading'), listening: met('listening'), students: members.length },
      });
    });
  }

  @Patch('groups/:chatId')
  @ApiOperation({
    summary:
      'Owner: set the level of a group (bound to the chat id, not the title), name it (D12) or deactivate it',
  })
  async patch(
    @CurrentPrincipal() principal: Principal,
    @Param('chatId', ParseIntPipe) chatId: number,
    @Body() dto: GroupPatchDto,
  ): Promise<Record<string, unknown>> {
    const scope = await this.scope.resolve(principal);
    this.scope.assertOwner(scope);
    const group = await this.groups.findById(chatId);
    if (!group) throw notFound(chatId);
    if (dto.level !== undefined) await this.groups.setLevel(chatId, dto.level);
    if (dto.title !== undefined) await this.groups.rename(chatId, dto.title);
    if (dto.isActive === false) await this.groups.deactivate(chatId);
    if (dto.isActive === true) await this.groups.activate(chatId);
    const fresh = await this.groups.findById(chatId);
    return groupView(fresh ?? group, { members: 0, teachers: [], week: null });
  }

  @Get('membership-checks')
  @ApiOperation({ summary: 'History of the monthly membership check (latest 12 runs)' })
  async checks(@CurrentPrincipal() principal: Principal): Promise<Record<string, unknown>[]> {
    await this.scope.resolve(principal);
    return (await this.membership.latest(12)).map(membershipCheckView);
  }

  @Post('membership-checks/run')
  @ApiOperation({
    summary:
      'Owner: run the membership check now (in the background; the owner gets the summary in Telegram)',
  })
  async run(
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ started: boolean; alreadyRunning: boolean }> {
    const scope = await this.scope.resolve(principal);
    this.scope.assertOwner(scope);
    if (this.checkRunning) return { started: false, alreadyRunning: true };
    this.checkRunning = true;
    void this.cron
      .run()
      .catch((err: Error) => this.logger.error(`membership check failed: ${err.message}`))
      .finally(() => {
        this.checkRunning = false;
      });
    return { started: true, alreadyRunning: false };
  }
}

function notFound(chatId: number): AppError {
  return new AppError({
    level: ErrorLevel.LOW_BUSINESS,
    service: ServiceCode.GROUPS,
    error: ErrorCode.NOT_FOUND,
    meta: { chatId },
  });
}
