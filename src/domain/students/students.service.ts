import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from './student.entity';

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

  async markDmBlocked(studentId: string): Promise<void> {
    await this.repo.update({ id: studentId }, { dmBlocked: true });
  }

  /** Any incoming DM proves the student hasn't blocked the bot. */
  async clearDmBlockedByTelegramId(telegramUserId: number): Promise<void> {
    await this.repo.update({ telegramUserId, dmBlocked: true }, { dmBlocked: false });
  }
}
