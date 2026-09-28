import { Logger } from '@nestjs/common';
import { Ctx, Next, On, Start, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { Message } from 'telegraf/types';
import { AppError } from '../../../common/errors';
import { AppConfigService } from '../../../config/config.service';
import { groupMessages } from '../../../domain/groups/messages';
import { studentMessages } from '../../../domain/students/messages';
import { RegistrationService } from '../../../domain/students/registration.service';
import { StudentState } from '../../../domain/students/student-state.enum';
import { StudentsService } from '../../../domain/students/students.service';
import { TeacherResolverService } from '../../teacher/teacher-resolver.service';

interface ContextWithPayload extends Context {
  startPayload?: string;
}

@Update()
export class RegistrationHandler {
  private readonly logger = new Logger(RegistrationHandler.name);

  constructor(
    private readonly registration: RegistrationService,
    private readonly students: StudentsService,
    private readonly config: AppConfigService,
    private readonly teacher: TeacherResolverService,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: ContextWithPayload): Promise<void> {
    if (ctx.chat?.type !== 'private' || !ctx.from) return;

    // Staff (super-admin or a teacher of any active group) get a staff greeting and
    // are never pulled into student registration — even via a group_ deep link.
    // Pressing Start still opens the DM, which is what lets the 08:30 cron reach them.
    if (this.config.isSuperAdmin(ctx.from.id) || (await this.teacher.isTeacherInAnyActiveGroup(ctx.from.id))) {
      await ctx.reply(groupMessages.staffStart);
      return;
    }

    const payload = ctx.startPayload ?? '';
    const match = payload.match(/^group_(-?\d+)$/);

    if (!match) {
      const existing = await this.students.findByTelegramId(ctx.from.id);
      if (existing) {
        await ctx.reply(studentMessages.help);
      } else {
        await ctx.reply(studentMessages.startInGroupOnly);
      }
      return;
    }

    const groupChatId = Number(match[1]);
    try {
      const result = await this.registration.startFromDeepLink(
        {
          telegramUserId: ctx.from.id,
          chatId: groupChatId,
          fullName: this.buildFullName(ctx.from.first_name, ctx.from.last_name),
          username: ctx.from.username ?? null,
        },
        groupChatId,
      );
      await ctx.reply(result.reply);
    } catch (err) {
      await this.handleError(ctx, err);
    }
  }

  @On('text')
  async onText(@Ctx() ctx: Context, @Next() next: () => Promise<void>): Promise<void> {
    // Only handle plain text in DM with a registered student in a registration state.
    // Everything else (group commands, DM commands, etc.) is forwarded so @Command handlers fire.
    if (ctx.chat?.type !== 'private' || !ctx.from) return next();
    const message = ctx.message as Message.TextMessage | undefined;
    if (!message?.text || message.text.startsWith('/')) return next();

    const student = await this.students.findByTelegramId(ctx.from.id);
    if (!student) return next();

    try {
      switch (student.state) {
        case StudentState.AWAITING_BOOK_TITLE: {
          const result = await this.registration.handleBookTitle(student, message.text);
          await ctx.reply(result.reply);
          return;
        }
        case StudentState.AWAITING_BOOK_TOTAL_PAGES: {
          const result = await this.registration.handleTotalPages(student, message.text);
          await ctx.reply(result.reply);
          return;
        }
        case StudentState.AWAITING_BOOK_START_PAGE: {
          const result = await this.registration.handleStartPage(student, message.text);
          await ctx.reply(result.reply);
          return;
        }
        default:
          // Evening states (handled by EveningHandler), IDLE, etc.
          return next();
      }
    } catch (err) {
      await this.handleError(ctx, err);
    }
  }

  private async handleError(ctx: Context, err: unknown): Promise<void> {
    if (err instanceof AppError) {
      this.logger.warn(`AppError [${err.code}]: ${err.message}`);
      await ctx.reply(err.message);
      return;
    }
    this.logger.error('Unhandled error in registration', err as Error);
  }

  private buildFullName(first: string, last?: string): string {
    return last ? `${first} ${last}` : first;
  }
}
