import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { Flag } from './flag.entity';
import { FlagClaim, FlagDetails, FlagKind, FlagStatus, SpotCheckVerdict } from './flag.enums';
import { SpotCheck } from './spot-check.entity';

export interface RaiseFlagInput {
  studentId: string;
  reportId: string | null;
  kind: FlagKind;
  reason: string;
  /** Cited statements behind this kind (verified quotes). */
  claims?: FlagClaim[];
  /** Report-level numbers; merged into the card's details, later values win. */
  details?: Omit<FlagDetails, 'reasons' | 'claims'>;
}

/** Signals of a flag: `kinds` when filled, else the legacy single `kind`. */
export function kindsOf(flag: Pick<Flag, 'kind' | 'kinds'>): FlagKind[] {
  return flag.kinds && flag.kinds.length > 0 ? flag.kinds : [flag.kind];
}

/** Per-kind reasons: from details, else the legacy single reason under the single kind. */
export function reasonsOf(
  flag: Pick<Flag, 'kind' | 'reason' | 'details'>,
): Partial<Record<FlagKind, string>> {
  const stored = flag.details?.reasons;
  return stored && Object.keys(stored).length > 0 ? stored : { [flag.kind]: flag.reason };
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

  /**
   * One card per report: a second signal on a report with an open (NEW) flag joins that flag as
   * another kind with its own reason, instead of a second card with the same text. Flags not
   * tied to a report (NORM_MISSED_WEEK) stay idempotent per (student, kind).
   */
  async raise(input: RaiseFlagInput): Promise<Flag> {
    const { studentId, reportId, kind, reason, claims, details } = input;
    const existing = await this.flags.findOne({
      where: reportId
        ? { studentId, reportId, status: FlagStatus.NEW }
        : { studentId, reportId: IsNull(), kind, status: FlagStatus.NEW },
    });
    if (existing) {
      const kinds = kindsOf(existing);
      if (kinds.includes(kind)) return existing;
      existing.kinds = [...kinds, kind];
      existing.details = {
        ...existing.details,
        ...details,
        reasons: { ...reasonsOf(existing), [kind]: reason },
        claims: claims
          ? { ...(existing.details?.claims ?? {}), [kind]: claims }
          : existing.details?.claims,
      };
      existing.reason = Object.values(existing.details.reasons ?? {}).join('\n');
      return this.flags.save(existing);
    }
    return this.flags.save(
      this.flags.create({
        studentId,
        reportId,
        kind,
        kinds: [kind],
        reason,
        details: {
          ...details,
          reasons: { [kind]: reason },
          ...(claims ? { claims: { [kind]: claims } } : {}),
        },
        status: FlagStatus.NEW,
      }),
    );
  }

  findNew(): Promise<Flag[]> {
    return this.flags.find({ where: { status: FlagStatus.NEW }, order: { createdAt: 'ASC' } });
  }

  findById(id: string): Promise<Flag | null> {
    return this.flags.findOne({ where: { id } });
  }

  async getById(id: string): Promise<Flag> {
    const flag = await this.findById(id);
    if (!flag) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.FLAGS,
        error: ErrorCode.NOT_FOUND,
        meta: { id },
      });
    }
    return flag;
  }

  /** Dashboard inbox: newest first; `studentIds` limits a teacher to their groups. */
  list(filter: {
    status?: FlagStatus;
    kind?: FlagKind;
    studentId?: string;
    studentIds?: string[] | null;
    limit?: number;
  }): Promise<Flag[]> {
    if (filter.studentIds && filter.studentIds.length === 0) return Promise.resolve([]);
    const qb = this.flags.createQueryBuilder('f');
    if (filter.status) qb.andWhere('f.status = :status', { status: filter.status });
    // A kind may be the card's first signal or one of the later ones.
    if (filter.kind)
      qb.andWhere('(f.kind = :kind OR f.kinds @> :kindJson::jsonb)', {
        kind: filter.kind,
        kindJson: JSON.stringify([filter.kind]),
      });
    if (filter.studentId) qb.andWhere('f.student_id = :studentId', { studentId: filter.studentId });
    if (filter.studentIds)
      qb.andWhere('f.student_id IN (:...studentIds)', { studentIds: filter.studentIds });
    return qb
      .orderBy('f.created_at', 'DESC')
      .take(Math.min(filter.limit ?? 100, 500))
      .getMany();
  }

  /**
   * Students with a flag the teacher confirmed (REVIEWED) on a report of the given week — they
   * are left out of that week's Top 3 (customer decision 02.11.2026: only confirmed flags count,
   * a new or dismissed card never costs anything).
   */
  async confirmedInWeek(studentIds: string[] | null, weekStart: string): Promise<Set<string>> {
    if (studentIds && studentIds.length === 0) return new Set();
    const qb = this.flags
      .createQueryBuilder('f')
      .select('DISTINCT f.student_id', 'studentId')
      .innerJoin('reports', 'r', 'r.id = f.report_id')
      .where('f.status = :status', { status: FlagStatus.REVIEWED })
      .andWhere('r.week_start = :weekStart', { weekStart });
    if (studentIds) qb.andWhere('f.student_id IN (:...studentIds)', { studentIds });
    const rows = await qb.getRawMany<{ studentId: string }>();
    return new Set(rows.map((r) => r.studentId));
  }

  /** Flags raised in `[from, to)` for the students (null = everyone), any status. */
  async countRaisedBetween(studentIds: string[] | null, from: Date, to: Date): Promise<number> {
    if (studentIds && studentIds.length === 0) return 0;
    const qb = this.flags
      .createQueryBuilder('f')
      .select('COUNT(*)', 'count')
      .where('f.created_at >= :from AND f.created_at < :to', { from, to });
    if (studentIds) qb.andWhere('f.student_id IN (:...studentIds)', { studentIds });
    const row = await qb.getRawOne<{ count: string }>();
    return Number(row?.count ?? 0);
  }

  /** The cards of one report (normally one), newest first. */
  byReport(reportId: string): Promise<Flag[]> {
    return this.flags.find({ where: { reportId }, order: { createdAt: 'DESC' } });
  }

  /** NEW flags per student — the badge in the student list. */
  async countNewByStudent(studentIds: string[] | null): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (studentIds && studentIds.length === 0) return out;
    const qb = this.flags
      .createQueryBuilder('f')
      .select('f.student_id', 'studentId')
      .addSelect('COUNT(*)', 'count')
      .where('f.status = :status', { status: FlagStatus.NEW })
      .groupBy('f.student_id');
    if (studentIds) qb.andWhere('f.student_id IN (:...studentIds)', { studentIds });
    const rows = await qb.getRawMany<{ studentId: string; count: string }>();
    for (const r of rows) out.set(r.studentId, Number(r.count));
    return out;
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
