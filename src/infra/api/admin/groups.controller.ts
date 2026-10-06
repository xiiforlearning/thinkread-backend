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
import { AccessService } from '../../../domain/admins/access.service';
import { AdminRole } from '../../../domain/admins/admin.entity';
import { GroupsService } from '../../../domain/groups/groups.service';
import { MembershipService } from '../../../domain/membership/membership.service';
import { recentWeekStarts } from '../../../domain/norms/week';
import { ReportsService } from '../../../domain/reports/reports.service';
import { StudentStatus } from '../../../domain/students/student.enums';
import { StudentsService } from '../../../domain/students/students.service';
import { MembershipCron } from '../../scheduler/membership.cron';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentPrincipal, Principal, Roles } from '../auth/principal';
import { GroupLevelDto } from './dto';
import { AdminScopeService } from './scope';
import { groupView, membershipCheckView } from './serializers';

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
  ) {}

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
    summary: 'Owner: set the level of a group (bound to the chat id, not the title)',
  })
  async setLevel(
    @CurrentPrincipal() principal: Principal,
    @Param('chatId', ParseIntPipe) chatId: number,
    @Body() dto: GroupLevelDto,
  ): Promise<Record<string, unknown>> {
    const scope = await this.scope.resolve(principal);
    this.scope.assertOwner(scope);
    const group = await this.groups.findById(chatId);
    if (!group) throw notFound(chatId);
    await this.groups.setLevel(chatId, dto.level);
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
