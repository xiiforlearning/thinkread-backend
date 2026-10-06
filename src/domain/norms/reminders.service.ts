import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReminderChannel, ReminderKind, ReminderLog } from './reminder-log.entity';
import { localDay } from './week';

/**
 * "Was this student already reminded about X today?" — one source of truth for
 * the scheduler (SCHEDULED) and the AI (WOVEN). A reminder woven into a
 * conversation counts for the whole day, whichever channel asks.
 */
@Injectable()
export class RemindersService {
  constructor(
    @InjectRepository(ReminderLog)
    private readonly repo: Repository<ReminderLog>,
  ) {}

  /** Kinds NOT yet reminded today on any channel. */
  async pendingToday(studentId: string, now: Date, timeZone: string): Promise<ReminderKind[]> {
    const periodKey = localDay(now, timeZone);
    const rows = await this.repo.find({ where: { studentId, periodKey } });
    const done = new Set(rows.map((r) => r.kind));
    return Object.values(ReminderKind).filter((k) => !done.has(k));
  }

  /** Idempotent: the unique index makes a repeat a no-op. */
  async mark(
    studentId: string,
    kind: ReminderKind,
    channel: ReminderChannel,
    now: Date,
    timeZone: string,
  ): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(ReminderLog)
      .values({ studentId, kind, channel, periodKey: localDay(now, timeZone) })
      .orIgnore()
      .execute();
  }
}
