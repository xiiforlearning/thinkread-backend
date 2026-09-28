import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { globalConfig } from '../../config/global.config';
import { GroupsService } from '../../domain/groups/groups.service';

interface ChatAdminWithTitle {
  status?: string;
  user?: { id?: number };
  custom_title?: string;
}

@Injectable()
export class TeacherResolverService {
  private readonly logger = new Logger(TeacherResolverService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly groups: GroupsService,
  ) {}

  /**
   * Pulls fresh admin list from Telegram, filters by custom_title="teacher"
   * (case-insensitive), persists into groups.teacher_telegram_ids. Returns the IDs.
   * On API failure, returns the cached list (whatever was last persisted).
   */
  async refresh(chatId: number): Promise<number[]> {
    try {
      const admins = (await this.bot.telegram.getChatAdministrators(chatId)) as ChatAdminWithTitle[];
      const wanted = globalConfig.admin.teacherCustomTitle.toLowerCase();
      const ids = admins
        .filter((a) => (a.custom_title ?? '').toLowerCase() === wanted)
        .map((a) => a.user?.id)
        .filter((id): id is number => typeof id === 'number');
      await this.groups.updateTeachers(chatId, ids);
      this.logger.log(`teachers for ${chatId} refreshed: ${ids.length} matched`);
      return ids;
    } catch (err) {
      const description = (err as { description?: string }).description ?? (err as Error).message;
      this.logger.warn(`teachers refresh for ${chatId} failed: ${description}`);
      const group = await this.groups.findById(chatId);
      return group?.teacherTelegramIds ?? [];
    }
  }

  /** True if user is in the (freshly refreshed) teacher list for the chat. */
  async isTeacherInGroup(telegramUserId: number, chatId: number): Promise<boolean> {
    const ids = await this.refresh(chatId);
    return ids.includes(telegramUserId);
  }

  /** True if user is cached as a teacher in ANY active group. No refresh. */
  async isTeacherInAnyActiveGroup(telegramUserId: number): Promise<boolean> {
    const groups = await this.groups.findActiveByTeacher(telegramUserId);
    return groups.length > 0;
  }
}
