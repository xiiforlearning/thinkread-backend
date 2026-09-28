import { Logger } from '@nestjs/common';
import { Command, Ctx, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { AppConfigService } from '../../../config/config.service';
import { SchedulerService } from '../../scheduler/scheduler.service';

/**
 * Admin-only triggers that fire the cron jobs immediately. Useful for
 * manual end-to-end verification without waiting for 20:00 / 23:00 / 00:05.
 * Not exposed in the bot's command menu.
 */
@Update()
export class DebugHandler {
  private readonly logger = new Logger(DebugHandler.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly scheduler: SchedulerService,
  ) {}

  /** Debug commands intentionally restricted to the super-admin only. */
  private isSuperAdmin(ctx: Context): boolean {
    return this.config.isSuperAdmin(ctx.from?.id);
  }

  @Command('cron_morning')
  async onCronMorning(@Ctx() ctx: Context): Promise<void> {
    if (!this.isSuperAdmin(ctx)) return;
    this.logger.log(`Manual trigger: morningCron by admin`);
    await ctx.reply('Запускаю 08:00-крон…');
    await this.scheduler.morningCron();
    await ctx.reply('Готово.');
  }

  @Command('cron_evening')
  async onCronEvening(@Ctx() ctx: Context): Promise<void> {
    if (!this.isSuperAdmin(ctx)) return;
    this.logger.log(`Manual trigger: eveningPromptCron by admin`);
    await ctx.reply('Запускаю 20:00-крон…');
    await this.scheduler.eveningPromptCron();
    await ctx.reply('Готово.');
  }

  @Command('cron_finalize')
  async onCronFinalize(@Ctx() ctx: Context): Promise<void> {
    if (!this.isSuperAdmin(ctx)) return;
    this.logger.log(`Manual trigger: finalizeDayCron by admin`);
    await ctx.reply('Запускаю 00:05-крон (finalize)…');
    await this.scheduler.finalizeDayCron();
    await ctx.reply('Готово.');
  }

  @Command('cron_weekly_report')
  async onCronWeeklyReport(@Ctx() ctx: Context): Promise<void> {
    if (!this.isSuperAdmin(ctx)) return;
    this.logger.log(`Manual trigger: weeklyReportCron by admin`);
    await ctx.reply('Запускаю недельный отчёт…');
    await this.scheduler.weeklyReportCron();
    await ctx.reply('Готово.');
  }
}
