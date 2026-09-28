import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { Presentation } from './presentation.entity';

@Injectable()
export class PresentationsService {
  constructor(
    @InjectRepository(Presentation)
    private readonly repo: Repository<Presentation>,
  ) {}

  hasPendingForStudent(studentId: string): Promise<boolean> {
    return this.repo.exists({ where: { studentId, done: false } });
  }

  assign(studentId: string): Promise<Presentation> {
    return this.repo.save(this.repo.create({ studentId, done: false }));
  }

  markDone(id: string): Promise<void> {
    return this.repo.update({ id }, { done: true }).then(() => undefined);
  }

  findPending(studentId: string): Promise<Presentation[]> {
    return this.repo.find({
      where: { studentId, done: false },
      order: { assignedAt: 'DESC' },
    });
  }

  /** Marks the latest pending presentation for a student as done. Returns the row, or null. */
  async markLatestPendingDone(studentId: string): Promise<Presentation | null> {
    const pending = await this.repo.findOne({
      where: { studentId, done: false },
      order: { assignedAt: 'DESC' },
    });
    if (!pending) return null;
    pending.done = true;
    return this.repo.save(pending);
  }

  /** Returns student IDs that received a presentation assigned >= sinceUTC. */
  async findStudentsWithRecentAssignment(
    studentIds: string[],
    sinceUTC: Date,
  ): Promise<Set<string>> {
    if (studentIds.length === 0) return new Set();
    const rows = await this.repo.find({
      where: {
        studentId: In(studentIds),
        assignedAt: MoreThanOrEqual(sinceUTC),
      },
      select: ['studentId'],
    });
    return new Set(rows.map((r) => r.studentId));
  }
}
