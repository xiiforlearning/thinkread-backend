import type Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { format } from 'date-fns';
import { AppConfigService } from '../../config/config.service';
import { globalConfig } from '../../config/global.config';
import { AiPurpose } from '../ai-log/ai-usage.entity';
import { FlagClaim, FlagKind, ReportMetrics } from '../flags/flag.enums';
import { FlagsService } from '../flags/flags.service';
import { LEVEL_LABELS } from '../groups/messages';
import { requiresRetelling } from '../groups/level';
import { Report, ReportType } from '../reports/report.entity';
import { ReportsService } from '../reports/reports.service';
import { langOf } from '../students/language';
import { Student } from '../students/student.entity';
import { lemmaOf } from '../words/normalize';
import { StudentsService } from '../students/students.service';
import {
  AUTHENTICITY_SYSTEM_PROMPT,
  AuthenticityEvidence,
  CONTENT_KINDS,
  VERDICT_TOOL,
  VERDICT_TOOL_NAME,
} from './authenticity.prompt';
import { LLM_PORT, LlmPort } from './llm.port';
import { dedupeText, findQuote, isConnectedText, proseOf, wordCount } from './report-text';
import { UsageService } from './usage.service';

export interface AnalysisInput {
  report: Report;
  /** Previous reports of the same type with connected prose, newest first. */
  previous: Report[];
  student: Student;
}

/** What the check concluded about one report — flags to raise and the evidence behind them. */
export interface Analysis {
  kinds: FlagKind[];
  reasons: Partial<Record<FlagKind, string>>;
  claims: Partial<Record<FlagKind, FlagClaim[]>>;
  metrics: ReportMetrics;
  baseline: { reports: number; errorsPer100: number; advanced: number } | null;
  errors: string[];
  advancedQuotes: string[];
  spotCheckQuestion: string | null;
  /** Model statements thrown away because their quote was not in the text. */
  dropped: number;
}

const EMPTY_EVIDENCE: AuthenticityEvidence = {
  findings: [],
  errors: [],
  advanced: [],
  spot_check_question: null,
};

/**
 * Background check of a freshly saved report. Deterministic signals first (forwarded message,
 * comprehension jump); then one model call that returns cited evidence — content findings with
 * quotes, the language slips, the above-level fragments — which code verifies against the
 * student's text and turns into flags: content kinds from verified findings, style kinds from
 * the measured error rate against the student's own history. The model never states a verdict
 * and never sees the AI summary. For no-transcript listening reports it may also plant a
 * spot-check question. Failures are logged and never reach the student.
 */
/** "1", "ep. 1", "Episode 1", "первая серия" → the number when there is one, else the lowered text. */
function episodeKey(episode: string): string {
  const digits = episode.match(/\d+/g);
  return digits ? digits.join('.') : lemmaOf(episode);
}

@Injectable()
export class AuthenticityService {
  private readonly logger = new Logger(AuthenticityService.name);
  /** Injectable randomness for tests. */
  random: () => number = Math.random;

  constructor(
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    private readonly usage: UsageService,
    private readonly reports: ReportsService,
    private readonly flags: FlagsService,
    private readonly students: StudentsService,
    private readonly config: AppConfigService,
  ) {}

  /** Fire-and-forget: the student's reply must not wait for this. */
  checkLater(report: Report, student: Student): void {
    void this.check(report, student).catch((err: Error) => {
      this.logger.warn(`authenticity check failed for report ${report.id}: ${err.message}`);
    });
  }

  async check(report: Report, student: Student): Promise<void> {
    const recent = await this.reports.recent(
      student.id,
      report.type,
      globalConfig.ai.authenticityHistory,
      report.id,
    );
    // Only connected prose is a base for comparison: a word list sent as a report is not.
    const previous = recent.filter((r) => isConnectedText(r.rawText));

    if (report.isForwarded) {
      await this.raise(report, FlagKind.FORWARDED, 'Отчёт пришёл пересланным сообщением.');
    }
    const same = this.sameEpisode(report, recent);
    if (same) {
      await this.raise(
        report,
        FlagKind.REPEATED_RETELLING,
        `Та же серия уже сдавалась ${format(same.createdAt, 'dd.MM')}: «${same.sourceTitle} — ${same.episode}».`,
      );
    }
    const jump = this.pctJump(report, recent);
    if (jump !== null) {
      await this.raise(
        report,
        FlagKind.PCT_JUMP,
        `Понимание с первого раза ${report.firstPassPct}% при среднем ${jump}% в предыдущих отчётах.`,
      );
    }

    const analysis = await this.analyze({ report, previous, student });
    await this.reports.setAiMetrics(report.id, analysis.metrics);
    if (analysis.dropped > 0)
      this.logger.log(
        `authenticity: ${analysis.dropped} unverifiable statement(s) dropped for report ${report.id}`,
      );
    for (const kind of analysis.kinds) {
      await this.flags.raise({
        studentId: report.studentId,
        reportId: report.id,
        kind,
        reason: analysis.reasons[kind] ?? '',
        claims: analysis.claims[kind],
        details: {
          metrics: analysis.metrics,
          baseline: analysis.baseline ?? undefined,
          errors: analysis.errors,
          advancedQuotes: analysis.advancedQuotes,
        },
      });
    }

    await this.maybePlantSpotCheck(report, student, analysis.spotCheckQuestion);
  }

  /** The whole judgement without side effects — also what the offline eval runs on real flags. */
  async analyze({ report, previous, student }: AnalysisInput): Promise<Analysis> {
    const text = dedupeText(report.rawText);
    const prose = proseOf(text);
    const evidence = await this.askModel(report, text, previous, student);

    let dropped = 0;
    const verify = (items: { quote: string }[], haystack: string): string[] => {
      const out: string[] = [];
      for (const item of items) {
        const quote = item.quote.trim();
        if (quote && findQuote(quote, haystack)) {
          if (!out.includes(quote)) out.push(quote);
        } else dropped += 1;
      }
      return out;
    };
    const errors = verify(evidence.errors, prose);
    const advancedQuotes = verify(evidence.advanced, prose);
    const words = wordCount(prose);
    const metrics: ReportMetrics = {
      words,
      errorsPer100: words > 0 ? Math.round((errors.length / words) * 1000) / 10 : 0,
      advanced: advancedQuotes.length,
    };

    const claims: Partial<Record<FlagKind, FlagClaim[]>> = {};
    for (const f of evidence.findings) {
      if (!(CONTENT_KINDS as readonly string[]).includes(f.kind)) continue;
      if (!f.quote?.trim() || !findQuote(f.quote, text)) {
        dropped += 1;
        continue;
      }
      let previousQuote: string | undefined;
      if (f.kind === FlagKind.REPEATED_RETELLING) {
        const pq = f.previous_quote?.trim();
        if (!pq || !previous.some((p) => findQuote(pq, p.rawText))) {
          dropped += 1;
          continue;
        }
        previousQuote = pq;
      }
      (claims[f.kind] ??= []).push({
        statement: f.statement.trim(),
        quote: f.quote.trim(),
        ...(previousQuote ? { previousQuote } : {}),
      });
    }

    const kinds: FlagKind[] = [];
    const reasons: Partial<Record<FlagKind, string>> = {};
    for (const kind of CONTENT_KINDS) {
      const list = claims[kind];
      if (!list || list.length === 0) continue;
      kinds.push(kind);
      reasons[kind] = list.map((c) => `${c.statement} («${c.quote}»)`).join(' ');
    }

    const history = previous.filter((p) => p.aiMetrics);
    const baseline =
      history.length >= globalConfig.ai.authenticityMinHistory
        ? {
            reports: history.length,
            errorsPer100: round1(avg(history.map((p) => p.aiMetrics?.errorsPer100 ?? 0))),
            advanced: round1(avg(history.map((p) => p.aiMetrics?.advanced ?? 0))),
          }
        : null;
    for (const [kind, reason] of this.judgeStyle(metrics, baseline, student, advancedQuotes)) {
      kinds.push(kind);
      reasons[kind] = reason;
    }

    return {
      kinds,
      reasons,
      claims,
      metrics,
      baseline,
      errors,
      advancedQuotes,
      spotCheckQuestion: evidence.spot_check_question,
      dropped,
    };
  }

  /**
   * Style flags from numbers, never from an impression: the verified error rate of the prose
   * against the student's own history (STYLE_MISMATCH) and against what is normal for the
   * level (TOO_POLISHED), each only together with verified above-level fragments.
   */
  private judgeStyle(
    metrics: ReportMetrics,
    baseline: Analysis['baseline'],
    student: Student,
    advancedQuotes: string[],
  ): Array<[FlagKind, string]> {
    const cfg = globalConfig.ai.style;
    if (!baseline || metrics.words < cfg.minProseWords || metrics.advanced < cfg.minAdvanced)
      return [];
    const out: Array<[FlagKind, string]> = [];
    const quoted = advancedQuotes
      .slice(0, 3)
      .map((q) => `«${q}»`)
      .join(', ');
    if (
      baseline.errorsPer100 >= cfg.baselineMinErrors &&
      metrics.errorsPer100 <= baseline.errorsPer100 / cfg.dropFactor
    ) {
      out.push([
        FlagKind.STYLE_MISMATCH,
        `Ошибок ${fmt(metrics.errorsPer100)} на 100 слов при обычных ${fmt(baseline.errorsPer100)} (по ${baseline.reports} отчётам). Новые для студента конструкции: ${quoted}.`,
      ]);
    }
    const clean = student.level ? (cfg.cleanErrorsByLevel[student.level] ?? 1) : 1;
    if (metrics.errorsPer100 <= clean && baseline.errorsPer100 >= clean * cfg.cleanBaselineFactor) {
      out.push([
        FlagKind.TOO_POLISHED,
        `Почти без ошибок: ${fmt(metrics.errorsPer100)} на 100 слов при обычных ${fmt(baseline.errorsPer100)} для этого студента (порог для уровня ${fmt(clean)}). Выше уровня: ${quoted}.`,
      ]);
    }
    return out;
  }

  /**
   * The same episode of the same series handed in twice (F10): exact, no model needed. Only
   * listening reports name an episode; a reading report's pages are a count, not a position.
   */
  private sameEpisode(report: Report, previous: Report[]): Report | null {
    if (report.type !== ReportType.LISTENING || !report.episode || !report.sourceTitle) return null;
    const key = (r: Report): string =>
      `${lemmaOf(r.sourceTitle ?? '')}|${episodeKey(r.episode ?? '')}`;
    const mine = key(report);
    return (
      previous.find((p) => p.episode && p.sourceTitle && key(p) === mine && p.id !== report.id) ??
      null
    );
  }

  /** Average first-pass % of previous listening reports, if this one jumps above it. */
  private pctJump(report: Report, previous: Report[]): number | null {
    if (report.type !== ReportType.LISTENING || report.firstPassPct === null) return null;
    const known = previous.map((r) => r.firstPassPct).filter((p): p is number => p !== null);
    if (known.length < 2) return null;
    const avgPct = Math.round(known.reduce((a, b) => a + b, 0) / known.length);
    return report.firstPassPct - avgPct >= globalConfig.ai.pctJumpThreshold ? avgPct : null;
  }

  private async askModel(
    report: Report,
    text: string,
    previous: Report[],
    student: Student,
  ): Promise<AuthenticityEvidence> {
    const model = this.config.aiModelAuthenticity;
    const response = await this.llm.complete({
      model,
      maxTokens: 1500,
      system: [
        { type: 'text', text: AUTHENTICITY_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [VERDICT_TOOL],
      toolChoice: { type: 'tool', name: VERDICT_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: JSON.stringify(
            {
              level: student.level ? LEVEL_LABELS[student.level] : 'не задан',
              question_language: langOf(student),
              type: report.type,
              method: report.method,
              retellingRequired:
                report.type === ReportType.LISTENING && report.method !== null
                  ? requiresRetelling(report.method)
                  : false,
              report: { ...this.describe(report), text },
              previous: previous.map((r) => this.describe(r)),
            },
            null,
            1,
          ),
        },
      ],
    });
    await this.usage.record(student.id, AiPurpose.AUTHENTICITY, model, response.usage);

    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === VERDICT_TOOL_NAME,
    );
    if (!call) {
      this.logger.warn(
        `authenticity: no evidence for report ${report.id} (stop_reason=${response.stop_reason})`,
      );
      return EMPTY_EVIDENCE;
    }
    const input = call.input as Partial<AuthenticityEvidence>;
    return {
      findings: Array.isArray(input.findings) ? input.findings : [],
      errors: Array.isArray(input.errors) ? input.errors : [],
      advanced: Array.isArray(input.advanced) ? input.advanced : [],
      spot_check_question:
        typeof input.spot_check_question === 'string' ? input.spot_check_question : null,
    };
  }

  /**
   * What the model sees of a report: the student's own text and the numbers. Never the AI
   * summary — it is written by the bot, in another language, and comparing the student's text
   * with it produced "a sharp contrast in language quality inside one report".
   */
  private describe(r: Report): Record<string, unknown> {
    return {
      date: r.createdAt?.toISOString().slice(0, 10),
      title: r.sourceTitle,
      episode: r.episode,
      pages: r.pages,
      firstPassPct: r.firstPassPct,
      secondPassPct: r.secondPassPct,
      listenCount: r.listenCount,
      text: dedupeText(r.rawText),
    };
  }

  private async maybePlantSpotCheck(
    report: Report,
    student: Student,
    question: string | null,
  ): Promise<void> {
    if (!question || report.type !== ReportType.LISTENING) return;
    if (report.method === null || !requiresRetelling(report.method)) return;
    if (student.dialogState.pendingSpotCheckId) return;
    if (this.random() >= globalConfig.ai.spotCheckProbability) return;

    const check = await this.flags.createSpotCheck(student.id, report.id, question.trim());
    await this.students.patchDialogState(student, { pendingSpotCheckId: check.id });
  }

  private raise(report: Report, kind: FlagKind, reason: string): Promise<unknown> {
    return this.flags.raise({ studentId: report.studentId, reportId: report.id, kind, reason });
  }
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
function fmt(x: number): string {
  return String(round1(x)).replace('.', ',');
}
