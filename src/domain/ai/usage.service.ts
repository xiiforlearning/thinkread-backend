import type Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiPurpose, AiUsage } from '../ai-log/ai-usage.entity';

/** USD per 1M tokens. Cache write = 1.25× input, cache read = 0.1× input. */
interface Pricing {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const PRICING: Array<{ prefix: string; price: Pricing }> = [
  { prefix: 'claude-haiku-4-5', price: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } },
  { prefix: 'claude-sonnet-5', price: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 } },
  { prefix: 'claude-opus-5', price: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 } },
];

export function estimateCostUsd(model: string, usage: Anthropic.Usage): number {
  const price = PRICING.find((p) => model.startsWith(p.prefix))?.price;
  if (!price) return 0;
  const perM = (tokens: number | null | undefined, rate: number): number =>
    ((tokens ?? 0) * rate) / 1_000_000;
  return (
    perM(usage.input_tokens, price.input) +
    perM(usage.output_tokens, price.output) +
    perM(usage.cache_creation_input_tokens, price.cacheWrite) +
    perM(usage.cache_read_input_tokens, price.cacheRead)
  );
}

export interface UsageReport {
  from: string;
  to: string;
  costUsd: number;
  tokens: number;
  calls: number;
  byPurpose: Array<{ purpose: AiPurpose; costUsd: number; tokens: number; calls: number }>;
  topStudents: Array<{ studentId: string; costUsd: number; tokens: number }>;
}

export function totalTokens(usage: Anthropic.Usage): number {
  return (
    usage.input_tokens +
    usage.output_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  );
}

@Injectable()
export class UsageService {
  constructor(
    @InjectRepository(AiUsage)
    private readonly repo: Repository<AiUsage>,
  ) {}

  async record(
    studentId: string | null,
    purpose: AiPurpose,
    model: string,
    usage: Anthropic.Usage,
  ): Promise<void> {
    await this.repo.save(
      this.repo.create({
        studentId,
        purpose,
        model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        costUsd: estimateCostUsd(model, usage).toFixed(6),
      }),
    );
  }

  /** Cost report for a period: totals, by purpose and the heaviest students. */
  async report(from: Date, to: Date, topLimit = 5): Promise<UsageReport> {
    const base = (): ReturnType<Repository<AiUsage>['createQueryBuilder']> =>
      this.repo
        .createQueryBuilder('u')
        .where('u.created_at >= :from', { from })
        .andWhere('u.created_at < :to', { to });
    const tokensExpr =
      'SUM(u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens)';
    const [totals, byPurpose, top] = await Promise.all([
      base()
        .select('COALESCE(SUM(u.cost_usd), 0)', 'cost')
        .addSelect(`COALESCE(${tokensExpr}, 0)`, 'tokens')
        .addSelect('COUNT(*)', 'calls')
        .getRawOne<{ cost: string; tokens: string; calls: string }>(),
      base()
        .select('u.purpose', 'purpose')
        .addSelect('COALESCE(SUM(u.cost_usd), 0)', 'cost')
        .addSelect(`COALESCE(${tokensExpr}, 0)`, 'tokens')
        .addSelect('COUNT(*)', 'calls')
        .groupBy('u.purpose')
        .getRawMany<{ purpose: AiPurpose; cost: string; tokens: string; calls: string }>(),
      base()
        .andWhere('u.student_id IS NOT NULL')
        .select('u.student_id', 'studentId')
        .addSelect('COALESCE(SUM(u.cost_usd), 0)', 'cost')
        .addSelect(`COALESCE(${tokensExpr}, 0)`, 'tokens')
        .groupBy('u.student_id')
        .orderBy('tokens', 'DESC')
        .limit(topLimit)
        .getRawMany<{ studentId: string; cost: string; tokens: string }>(),
    ]);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      costUsd: Number(totals?.cost ?? 0),
      tokens: Number(totals?.tokens ?? 0),
      calls: Number(totals?.calls ?? 0),
      byPurpose: byPurpose.map((r) => ({
        purpose: r.purpose,
        costUsd: Number(r.cost),
        tokens: Number(r.tokens),
        calls: Number(r.calls),
      })),
      topStudents: top.map((r) => ({
        studentId: r.studentId,
        costUsd: Number(r.cost),
        tokens: Number(r.tokens),
      })),
    };
  }

  /** Tokens spent by a student since `since` (the start of the local day for the daily cap). */
  async tokensSince(studentId: string, since: Date): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('u')
      .select(
        'COALESCE(SUM(u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens), 0)',
        'total',
      )
      .where('u.student_id = :studentId', { studentId })
      .andWhere('u.created_at >= :since', { since })
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }
}
