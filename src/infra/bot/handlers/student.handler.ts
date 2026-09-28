import { Logger } from '@nestjs/common';
import { Command, Ctx, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { studentMessages } from '../../../domain/students/messages';
import { RegistrationService } from '../../../domain/students/registration.service';
import { StudentsService } from '../../../domain/students/students.service';

@Update()
export class StudentHandler {
  private readonly logger = new Logger(StudentHandler.name);

  constructor(
    private readonly students: StudentsService,
    private readonly registration: RegistrationService,
  ) {}

  @Command('book')
  async onBook(@Ctx() ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private' || !ctx.from) return;
    const student = await this.students.findByTelegramId(ctx.from.id);
    if (!student) {
      await ctx.reply(studentMessages.notRegistered);
      return;
    }
    const result = await this.registration.restartBook(student);
    this.logger.log(`Student ${student.id} restarted book via /book`);
    await ctx.reply(`${studentMessages.bookRestartIntro}\n${result.reply}`);
  }

  @Command('mystatus')
  async onMyStatus(@Ctx() ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private' || !ctx.from) return;
    const student = await this.students.findByTelegramId(ctx.from.id);
    if (!student) {
      await ctx.reply(studentMessages.notRegistered);
      return;
    }
    await ctx.reply(
      studentMessages.myStatus(
        student.fullName,
        student.bookTitle,
        student.currentPage,
        student.bookTotalPages,
      ),
    );
  }

  @Command('help')
  async onHelp(@Ctx() ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private') return;
    await ctx.reply(studentMessages.help);
  }
}
