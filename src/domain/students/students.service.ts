import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Student } from './student.entity';
import { StudentState } from './student-state.enum';

export interface CreateStudentInput {
  telegramUserId: number;
  chatId: number;
  fullName: string;
  username: string | null;
}

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly repo: Repository<Student>,
  ) {}

  findByTelegramId(telegramUserId: number): Promise<Student | null> {
    return this.repo.findOne({ where: { telegramUserId } });
  }

  findById(id: string): Promise<Student | null> {
    return this.repo.findOne({ where: { id } });
  }

  findAll(): Promise<Student[]> {
    return this.repo.find({ order: { fullName: 'ASC' } });
  }

  findByChat(chatId: number): Promise<Student[]> {
    return this.repo.find({ where: { chatId }, order: { fullName: 'ASC' } });
  }

  findByChats(chatIds: number[]): Promise<Student[]> {
    if (chatIds.length === 0) return Promise.resolve([]);
    return this.repo.find({ where: { chatId: In(chatIds) }, order: { fullName: 'ASC' } });
  }

  async create(input: CreateStudentInput): Promise<Student> {
    const student = this.repo.create({
      telegramUserId: input.telegramUserId,
      chatId: input.chatId,
      fullName: input.fullName,
      username: input.username,
      state: StudentState.AWAITING_BOOK_TITLE,
    });
    return this.repo.save(student);
  }

  save(student: Student): Promise<Student> {
    return this.repo.save(student);
  }

  async setState(student: Student, state: StudentState): Promise<Student> {
    student.state = state;
    return this.repo.save(student);
  }

  /** Arm the morning self-check for `wordId`, remembering how many cards follow it. */
  async setPendingRecall(studentId: string, wordId: string, remaining: number): Promise<void> {
    await this.repo.update(
      { id: studentId },
      {
        state: StudentState.AWAITING_RECALL_ANSWER,
        pendingReviewWordId: wordId,
        pendingReviewRemaining: remaining,
      },
    );
  }

  async resetBookForRestart(student: Student): Promise<Student> {
    student.bookTitle = null;
    student.bookTotalPages = null;
    student.bookStartPage = 1;
    student.currentPage = null;
    student.state = StudentState.AWAITING_BOOK_TITLE;
    return this.repo.save(student);
  }

  findIdleInAnyActiveGroup(): Promise<Student[]> {
    return this.repo
      .createQueryBuilder('student')
      .innerJoin('groups', 'g', 'g.chat_id = student.chat_id AND g.is_active = TRUE')
      .where('student.state = :state', { state: StudentState.IDLE })
      .andWhere('student.dm_blocked = FALSE')
      .getMany();
  }

  findAllInAnyActiveGroup(): Promise<Student[]> {
    return this.repo
      .createQueryBuilder('student')
      .innerJoin('groups', 'g', 'g.chat_id = student.chat_id AND g.is_active = TRUE')
      .where('student.dm_blocked = FALSE')
      .getMany();
  }

  async markDmBlocked(studentId: string): Promise<void> {
    await this.repo.update({ id: studentId }, { dmBlocked: true });
  }

  async clearDmBlockedByTelegramId(telegramUserId: number): Promise<void> {
    await this.repo.update({ telegramUserId, dmBlocked: true }, { dmBlocked: false });
  }

  findStuckInEveningStates(): Promise<Student[]> {
    return this.repo.find({
      where: {
        state: In([
          StudentState.AWAITING_EVENING_EXERCISES,
          StudentState.AWAITING_EVENING_LISTENING_WORDS,
          StudentState.AWAITING_EVENING_WORDS,
          StudentState.AWAITING_EVENING_PAGE,
          StudentState.AWAITING_RECALL_ANSWER,
        ]),
      },
    });
  }

  countByChat(chatId: number): Promise<number> {
    return this.repo.count({ where: { chatId } });
  }

  // Stage 8 helper — kept for future use; ignored for now.
  countWithoutBook(): Promise<number> {
    return this.repo.count({ where: { bookTitle: IsNull() } });
  }
}
