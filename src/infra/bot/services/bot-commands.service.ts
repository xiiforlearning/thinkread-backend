import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

@Injectable()
export class BotCommandsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BotCommandsService.name);

  constructor(@InjectBot() private readonly bot: Telegraf) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      // Student commands — visible in any private chat.
      await this.bot.telegram.setMyCommands(
        [
          { command: 'add', description: 'Добавить слова по одному' },
          { command: 'words', description: 'Отправить слова списком' },
          { command: 'done', description: 'Завершить /add' },
          { command: 'page', description: 'Отметить текущую страницу' },
          { command: 'review', description: 'Повторить слова' },
          { command: 'book', description: 'Сменить книгу' },
          { command: 'mystatus', description: 'Мой прогресс' },
          { command: 'help', description: 'Список команд' },
        ],
        { scope: { type: 'all_private_chats' } },
      );

      // Admin commands — visible only to chat administrators in any group.
      await this.bot.telegram.setMyCommands(
        [
          { command: 'open_signup', description: 'Открыть регистрацию (анонс с кнопкой)' },
          { command: 'link', description: 'Ссылка для регистрации' },
          { command: 'settings', description: 'Настройки группы' },
          { command: 'students', description: 'Список студентов' },
          { command: 'report', description: 'Недельный отчёт (last — прошлая)' },
          { command: 'student', description: 'Детально по студенту <имя|id>' },
          { command: 'group_report', description: 'Отчёт в группе: on/off' },
          { command: 'set_morning', description: 'Утреннее время (HH:MM)' },
          { command: 'set_evening', description: 'Вечернее время (HH:MM)' },
          { command: 'skip_presentation', description: 'Скип презентации <studentId>' },
        ],
        { scope: { type: 'all_chat_administrators' } },
      );

      // Default scope (regular group members, etc.) — no commands.
      await this.bot.telegram.setMyCommands([], { scope: { type: 'default' } });

      this.logger.log('Bot commands registered (DM + admin scopes)');
    } catch (err) {
      this.logger.warn(`Failed to register bot commands: ${(err as Error).message}`);
    }
  }
}
