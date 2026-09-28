import { Logger } from '@nestjs/common';
import { Ctx, Next, On, Start, Update, Use } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { GroupsService } from '../../domain/groups/groups.service';
import { StudentsService } from '../../domain/students/students.service';
import { TeacherResolverService } from '../teacher/teacher-resolver.service';
import { botMessages } from './messages';

@Update()
export class BotUpdate {
  private readonly logger = new Logger(BotUpdate.name);

  constructor(
    private readonly groups: GroupsService,
    private readonly students: StudentsService,
    private readonly teacher: TeacherResolverService,
  ) {}

  @Use()
  async logEveryUpdate(@Ctx() ctx: Context, @Next() next: () => Promise<void>): Promise<void> {
    // Message text is not logged: students' reports are personal data.
    this.logger.log(
      `update type=${ctx.updateType} chat=${ctx.chat?.id ?? '-'}(${ctx.chat?.type ?? '-'}) from=${ctx.from?.id ?? '-'}`,
    );
    if (ctx.from && ctx.chat?.type === 'private') {
      try {
        await this.students.clearDmBlockedByTelegramId(ctx.from.id);
      } catch (err) {
        this.logger.warn(`clearDmBlocked failed: ${(err as Error).message}`);
      }
    }
    return next();
  }

  @On('my_chat_member')
  async onMyChatMember(@Ctx() ctx: Context): Promise<void> {
    const update = ctx.myChatMember;
    if (!update) return;

    const chat = update.chat;
    if (chat.type !== 'group' && chat.type !== 'supergroup') return;

    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;

    if (newStatus === 'left' || newStatus === 'kicked') {
      this.logger.log(`Bot removed from group ${chat.id} (${oldStatus} → ${newStatus})`);
      await this.groups.deactivate(chat.id);
      return;
    }

    if (newStatus !== 'member' && newStatus !== 'administrator') return;
    if (oldStatus === 'member' || oldStatus === 'administrator') return;

    const title = 'title' in chat ? chat.title : 'Untitled';
    this.logger.log(`Bot added to group ${chat.id} "${title}" by user ${update.from.id}`);

    await this.groups.upsert(chat.id, title);
    await this.teacher.refresh(chat.id).catch(() => undefined);
  }

  @Start()
  async onStart(@Ctx() ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private') return;
    await ctx.reply(botMessages.underConstruction);
  }

  @On('text')
  async onText(@Ctx() ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private') return;
    await ctx.reply(botMessages.underConstruction);
  }
}
