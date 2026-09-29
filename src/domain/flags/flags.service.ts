import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { Flag } from './flag.entity';
import { FlagKind, FlagStatus, SpotCheckVerdict } from './flag.enums';
import { SpotCheck } from './spot-check.entity';

export interface RaiseFlagInput {
  studentId: string;
  reportId: string | null;
  kind: FlagKind;
  reason: string;
}

/**
 * Quiet flags for the teacher and spot checks. Nothing here ever reaches the
 * student: no message, no status change, no reduced norm.
 */
@Injectable()
export class FlagsService {
  constructor(
    @InjectRepository(Flag)
    private readonly flags: Repository<Flag>,
    @InjectRepository(SpotCheck)
    private readonly spotChecks: Repository<SpotCheck>,
  ) {}

  /** Idempotent per (student, report, kind) while the flag is still NEW. */
  async raise(input: RaiseFlagInput): Promise<Flag> {
    const existing = await this.flags.findOne({
      where: {
        studentId: input.studentId,
        reportId: input.reportId ?? IsNull(),
        kind: input.kind,
        status: FlagStatus.NEW,
      },
    });
    if (existing) return existing;
    return this.flags.save(this.flags.create({ ...input, status: FlagStatus.NEW }));
  }

  findNew(): Promise<Flag[]> {
    return this.flags.find({ where: { status: FlagStatus.NEW }, order: { createdAt: 'ASC' } });
  }

  async review(id: string, status: FlagStatus.REVIEWED | FlagStatus.DISMISSED): Promise<void> {
    await this.flags.update({ id }, { status, reviewedAt: new Date() });
  }

  // --- spot checks -----------------------------------------------------------

  createSpotCheck(studentId: string, reportId: string, question: string): Promise<SpotCheck> {
    return this.spotChecks.save(this.spotChecks.create({ studentId, reportId, question }));
  }

  findSpotCheck(id: string): Promise<SpotCheck | null> {
    return this.spotChecks.findOne({ where: { id } });
  }

  async markSpotCheckAsked(id: string, now: Date): Promise<void> {
    await this.spotChecks.update({ id, askedAt: IsNull() }, { askedAt: now });
  }

  /**
   * Store the student's answer and the model's verdict. Anything but OK is a
   * quiet flag — the student is never told.
   */
  async answerSpotCheck(
    id: string,
    answer: string | null,
    verdict: SpotCheckVerdict,
    now: Date,
  ): Promise<SpotCheck> {
    const check = await this.findSpotCheck(id);
    if (!check) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.FLAGS,
        error: ErrorCode.NOT_FOUND,
        meta: { id },
      });
    }
    check.answer = answer;
    check.verdict = verdict;
    check.answeredAt = now;
    if (check.askedAt === null) check.askedAt = now;
    await this.spotChecks.save(check);

    if (verdict !== SpotCheckVerdict.OK) {
      await this.raise({
        studentId: check.studentId,
        reportId: check.reportId,
        kind: FlagKind.SPOT_CHECK_FAILED,
        reason: `Точечный вопрос: «${check.question}» — вердикт ${verdict}.`,
      });
    }
    return check;
  }
}
