import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '../../../domain/admins/admin.entity';
import { Flag } from '../../../domain/flags/flag.entity';
import { FlagsService } from '../../../domain/flags/flags.service';
import { GroupsService } from '../../../domain/groups/groups.service';
import { ReportsService } from '../../../domain/reports/reports.service';
import { StudentsService } from '../../../domain/students/students.service';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentPrincipal, Principal, Roles } from '../auth/principal';
import { reportView } from '../me/serializers';
import { FlagsQueryDto, ReviewFlagDto } from './dto';
import { AdminScope, AdminScopeService, forbidden } from './scope';
import { flagView, GroupRef } from './serializers';

/** 13 · Флаги — the quiet inbox; nothing here is ever shown to the student. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(AdminRole.OWNER, AdminRole.TEACHER)
@Controller('admin/flags')
export class AdminFlagsController {
  constructor(
    private readonly scope: AdminScopeService,
    private readonly flags: FlagsService,
    private readonly students: StudentsService,
    private readonly groups: GroupsService,
    private readonly reports: ReportsService,
  ) {}

  private async enrich(flags: Flag[]): Promise<Record<string, unknown>[]> {
    const studentIds = [...new Set(flags.map((f) => f.studentId))];
    const [students, groups, byStudent] = await Promise.all([
      this.students.findAll({ ids: studentIds }),
      this.groups.findAllActive(),
      this.students.memberGroupIdsFor(studentIds),
    ]);
    const title = new Map(groups.map((g) => [g.chatId, g.title]));
    const refs = (id: string): GroupRef[] =>
      (byStudent.get(id) ?? [])
        .filter((c) => title.has(c))
        .map((chatId) => ({ chatId, title: title.get(chatId) as string }));
    const byId = new Map(students.map((s) => [s.id, s]));
    const reports = await Promise.all(
      flags.map((f) => (f.reportId ? this.reports.findById(f.reportId) : null)),
    );
    return flags.map((f, i) =>
      flagView(f, byId.get(f.studentId) ?? null, refs(f.studentId), reports[i]),
    );
  }

  private async visible(scope: AdminScope, flag: Flag): Promise<void> {
    if (scope.groupIds === null) return;
    const groups = await this.students.memberGroupIds(flag.studentId);
    if (!groups.some((g) => scope.groupIds?.includes(g))) throw forbidden();
  }

  @Get()
  @ApiOperation({ summary: 'Flags in scope, newest first (default: every status)' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() q: FlagsQueryDto,
  ): Promise<Record<string, unknown>[]> {
    const scope = await this.scope.resolve(principal);
    const flags = await this.flags.list({
      status: q.status,
      kind: q.kind,
      studentId: q.studentId,
      studentIds: await this.scope.studentIds(scope),
      limit: 200,
    });
    return this.enrich(flags);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'One flag with the flagged report (raw text) and the previous reports of the same type',
  })
  async one(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    const scope = await this.scope.resolve(principal);
    const flag = await this.flags.getById(id);
    await this.visible(scope, flag);
    const [view] = await this.enrich([flag]);
    const report = flag.reportId ? await this.reports.findById(flag.reportId) : null;
    const previous = report
      ? await this.reports.recent(flag.studentId, report.type, 3, report.id)
      : [];
    return {
      ...view,
      report: report
        ? { ...reportView(report), rawText: report.rawText, isForwarded: report.isForwarded }
        : null,
      previousReports: previous.map((r) => ({ ...reportView(r), rawText: r.rawText })),
    };
  }

  @Post(':id/review')
  @ApiOperation({
    summary: '"Проверено" (REVIEWED) or "Ложная тревога" (DISMISSED) — feedback for tuning',
  })
  async review(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewFlagDto,
  ): Promise<Record<string, unknown>> {
    const scope = await this.scope.resolve(principal);
    const flag = await this.flags.getById(id);
    await this.visible(scope, flag);
    await this.flags.review(flag.id, dto.status);
    const [view] = await this.enrich([await this.flags.getById(id)]);
    return view;
  }
}
