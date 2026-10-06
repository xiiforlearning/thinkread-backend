import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '../../../domain/admins/admin.entity';
import {
  ReminderPlannerService,
  ReminderRun,
} from '../../../domain/notify/reminder-planner.service';
import {
  WeeklySummary,
  WeeklySummaryRun,
  WeeklySummaryService,
} from '../../../domain/notify/weekly-summary.service';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentPrincipal, Principal, Roles } from '../auth/principal';
import { OverviewQueryDto, RunRemindersDto } from './dto';
import { AdminScopeService } from './scope';

/** Scheduled jobs on demand: reminders and the weekly summary (owner), the summary preview (staff). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(AdminRole.OWNER, AdminRole.TEACHER)
@Controller('admin')
export class AdminOpsController {
  constructor(
    private readonly scope: AdminScopeService,
    private readonly reminders: ReminderPlannerService,
    private readonly summary: WeeklySummaryService,
  ) {}

  @Post('reminders/run')
  @ApiOperation({
    summary: "Owner: send today's reminders now (cards or reports; report days ignored)",
  })
  async runReminders(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: RunRemindersDto,
  ): Promise<ReminderRun> {
    this.scope.assertOwner(await this.scope.resolve(principal));
    return dto.kind === 'CARDS'
      ? this.reminders.runCards()
      : this.reminders.runReports(new Date(), true);
  }

  @Get('weekly-summary')
  @ApiOperation({
    summary: 'Preview of the weekly summary (last complete week by default) in scope',
  })
  async preview(
    @CurrentPrincipal() principal: Principal,
    @Query() q: OverviewQueryDto,
  ): Promise<WeeklySummary & { text: string }> {
    const scope = await this.scope.resolve(principal);
    const ids = scope.isOwner ? null : await this.scope.studentIds(scope);
    const summary = await this.summary.build(
      new Date(),
      q.week === 'this' ? 0 : 1,
      ids,
      scope.groupIds,
    );
    return { ...summary, text: this.summary.format(summary, scope.isOwner) };
  }

  @Post('weekly-summary/run')
  @ApiOperation({
    summary: "Owner: flag last week's no-shows and send the summary to the owner and teachers now",
  })
  async runSummary(@CurrentPrincipal() principal: Principal): Promise<WeeklySummaryRun> {
    this.scope.assertOwner(await this.scope.resolve(principal));
    return this.summary.run();
  }
}
