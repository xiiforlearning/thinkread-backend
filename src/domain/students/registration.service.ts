import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { GroupsService } from '../groups/groups.service';
import { studentMessages } from './messages';
import { StudentState } from './student-state.enum';
import { Student } from './student.entity';
import { StudentsService, type CreateStudentInput } from './students.service';

export interface StepResult {
  reply: string;
}

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly students: StudentsService,
    private readonly groups: GroupsService,
  ) {}

  async startFromDeepLink(
    input: CreateStudentInput,
    groupChatId: number,
  ): Promise<StepResult> {
    const group = await this.groups.findById(groupChatId);
    if (!group || !group.isActive) {
      throw new AppError({
        level: ErrorLevel.INFO,
        service: ServiceCode.GROUPS,
        error: ErrorCode.NOT_FOUND,
        message: studentMessages.groupInactive,
      });
    }

    const existing = await this.students.findByTelegramId(input.telegramUserId);
    if (existing) {
      const reset = await this.students.resetBookForRestart(existing);
      this.logger.log(`Student ${reset.id} re-registering (deep link)`);
      return {
        reply: `${studentMessages.bookRestartIntro}\n${studentMessages.bookRestartPrompt}`,
      };
    }

    const created = await this.students.create({ ...input, chatId: groupChatId });
    this.logger.log(`Student ${created.id} registered in group ${groupChatId}`);
    return { reply: studentMessages.greetingAndAskBook(created.fullName) };
  }

  async restartBook(student: Student): Promise<StepResult> {
    await this.students.resetBookForRestart(student);
    return { reply: studentMessages.bookRestartPrompt };
  }

  async handleBookTitle(student: Student, raw: string): Promise<StepResult> {
    const title = raw.trim();
    if (title.length === 0) {
      return { reply: studentMessages.askTitleAgain };
    }
    student.bookTitle = title;
    await this.students.setState(student, StudentState.AWAITING_BOOK_TOTAL_PAGES);
    return { reply: studentMessages.askTotalPages(title) };
  }

  async handleTotalPages(student: Student, raw: string): Promise<StepResult> {
    const total = parsePositiveInt(raw);
    if (total === null) {
      return { reply: studentMessages.askTotalPagesAgain };
    }
    student.bookTotalPages = total;
    await this.students.setState(student, StudentState.AWAITING_BOOK_START_PAGE);
    return { reply: studentMessages.askStartPage(total) };
  }

  async handleStartPage(student: Student, raw: string): Promise<StepResult> {
    const total = student.bookTotalPages;
    if (total === null) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.STUDENTS,
        error: ErrorCode.INVALID_STATE,
        message: 'Total pages not set before start page step',
        meta: { studentId: student.id },
      });
    }
    const start = parsePositiveInt(raw);
    if (start === null || start > total) {
      return { reply: studentMessages.askStartPageOutOfRange(total) };
    }
    student.bookStartPage = start;
    student.currentPage = start;
    student.state = StudentState.IDLE;
    await this.students.save(student);
    return {
      reply: studentMessages.registrationComplete(student.bookTitle ?? '', start, total),
    };
  }
}

function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s+/g, '');
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}
