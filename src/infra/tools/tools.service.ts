import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { Repository } from 'typeorm';
import { GroupsService } from '../../domain/groups/groups.service';
import { DailyReport } from '../../domain/reports/daily-report.entity';
import { Presentation } from '../../domain/presentations/presentation.entity';
import { RegistrationService } from '../../domain/students/registration.service';
import { studentMessages } from '../../domain/students/messages';
import { Student } from '../../domain/students/student.entity';
import { Word } from '../../domain/words/word.entity';
import { buildGroupDeepLink } from '../bot/utils/deep-link';

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    @InjectRepository(Word) private readonly wordsRepo: Repository<Word>,
    @InjectRepository(DailyReport) private readonly reportsRepo: Repository<DailyReport>,
    @InjectRepository(Presentation) private readonly presRepo: Repository<Presentation>,
    private readonly registration: RegistrationService,
    private readonly groups: GroupsService,
  ) {}

  /**
   * Clean slate for a repeatable "from scratch" demo: wipe the student's words,
   * daily reports and presentations, reset the book, and DM them the very first
   * registration question so the presenter can walk the person through onboarding.
   */
  async resetStudent(student: Student): Promise<Record<string, unknown>> {
    const w = await this.wordsRepo.delete({ studentId: student.id });
    const r = await this.reportsRepo.delete({ studentId: student.id });
    const p = await this.presRepo.delete({ studentId: student.id });
    await this.registration.restartBook(student); // clears book + state → AWAITING_BOOK_TITLE
    await this.bot.telegram.sendMessage(
      student.telegramUserId,
      studentMessages.greetingAndAskBook(student.fullName),
    );
    this.logger.log(`Reset student ${student.id} for demo`);
    return {
      ok: true,
      student: student.fullName,
      deleted: { words: w.affected ?? 0, reports: r.affected ?? 0, presentations: p.affected ?? 0 },
      note: 'Студент сброшен и получил вопрос про книгу — пусть ответит в Telegram (автор и название).',
    };
  }

  /** Active groups with their registration deep-links (for first-time onboarding). */
  async listGroups(): Promise<Array<Record<string, unknown>>> {
    const groups = await this.groups.findAllActive();
    let username = '';
    try {
      username = (await this.bot.telegram.getMe()).username ?? '';
    } catch (err) {
      this.logger.warn(`getMe failed: ${(err as Error).message}`);
    }
    return groups.map((g) => ({
      chatId: g.chatId,
      title: g.title,
      isActive: g.isActive,
      deepLink: username ? buildGroupDeepLink(username, g.chatId) : null,
    }));
  }
}
