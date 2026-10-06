import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { globalConfig } from '../../config/global.config';
import { WeeklySummaryService } from '../../domain/notify/weekly-summary.service';

/** Monday morning: flag the week's no-shows and send the summary to the owner and teachers. */
@Injectable()
export class WeeklySummaryCron {
  private readonly logger = new Logger(WeeklySummaryCron.name);

  constructor(private readonly summary: WeeklySummaryService) {}

  @Cron(globalConfig.schedule.weeklySummaryCron, { timeZone: 'Asia/Tashkent' })
  async weekly(): Promise<void> {
    try {
      await this.summary.run();
    } catch (err) {
      this.logger.error(`weekly summary failed: ${(err as Error).message}`);
    }
  }
}
