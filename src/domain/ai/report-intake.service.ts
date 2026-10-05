import type Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { AppConfigService } from '../../config/config.service';
import { AiPurpose } from '../ai-log/ai-usage.entity';
import { ListeningMethod, listeningMethodFor } from '../groups/level';
import {
  ListeningField,
  MIN_RETELLING_CHARS,
  missingListeningFields,
  requiredListeningFields,
} from '../reports/listening-fields';
import { Report, ReportType } from '../reports/report.entity';
import { ReportsService, WeekProgress } from '../reports/reports.service';
import { Student } from '../students/student.entity';
import { ReportDraft } from '../students/student.enums';
import { StudentsService } from '../students/students.service';
import { lemmaOf } from '../words/normalize';
import { WordSource } from '../words/word.enums';
import { WordsService } from '../words/words.service';
import { AuthenticityService } from './authenticity.service';
import { EnrichmentService } from './enrichment.service';
import { LLM_PORT, LlmPort } from './llm.port';
import {
  PARSE_SYSTEM_PROMPT,
  PARSE_TOOL_NAME,
  ParsedReport,
  parseTool,
} from './report-intake.prompt';
import { UsageService } from './usage.service';

const MIN_SUMMARY_CHARS = 20;
const DRAFT_TTL_MS = 24 * 3_600_000;

export type IntakeResult =
  | {
      status: 'SAVED';
      report: Report;
      weekProgress: WeekProgress;
      words: { added: string[]; alreadyHad: string[] };
    }
  | {
      status: 'CLARIFY';
      draftId: string;
      missingFields: string[];
      question: string;
    };

/**
 * Report intake for the Mini App form: one structured model call, then the
 * same rules as the chat tools (daily limit, required fields per method), with
 * a draft kept in dialog_state while the student answers one clarification.
 */
@Injectable()
export class ReportIntakeService {
  private readonly logger = new Logger(ReportIntakeService.name);

  constructor(
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    private readonly usage: UsageService,
    private readonly reports: ReportsService,
    private readonly words: WordsService,
    private readonly students: StudentsService,
    private readonly authenticity: AuthenticityService,
    private readonly enrichment: EnrichmentService,
    private readonly config: AppConfigService,
  ) {}

  async submit(
    student: Student,
    type: ReportType,
    text: string,
    now: Date,
    timeZone: string,
  ): Promise<IntakeResult> {
    await this.assertDailyLimit(student, type, now, timeZone);
    return this.process(student, type, text.trim(), now, timeZone);
  }

  /** The student answered the clarification: parse everything written so far. */
  async clarify(
    student: Student,
    draftId: string,
    answer: string,
    now: Date,
    timeZone: string,
  ): Promise<IntakeResult> {
    const draft = student.dialogState.reportDraft;
    if (
      !draft ||
      draft.id !== draftId ||
      now.getTime() - new Date(draft.createdAt).getTime() > DRAFT_TTL_MS
    ) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.REPORTS,
        error: ErrorCode.NOT_FOUND,
        meta: { draftId },
      });
    }
    const type = draft.type === 'READING' ? ReportType.READING : ReportType.LISTENING;
    await this.assertDailyLimit(student, type, now, timeZone);
    return this.process(student, type, `${draft.text}\n\n${answer.trim()}`, now, timeZone);
  }

  private async process(
    student: Student,
    type: ReportType,
    text: string,
    now: Date,
    timeZone: string,
  ): Promise<IntakeResult> {
    const parsed = await this.parse(student, type, text);
    const missing = this.missing(parsed, listeningMethodFor(student.level));
    if (missing.length > 0) {
      const draft: ReportDraft = {
        id: randomUUID(),
        type: parsed.kind,
        text,
        missingFields: missing,
        createdAt: now.toISOString(),
      };
      await this.students.patchDialogState(student, { reportDraft: draft });
      return {
        status: 'CLARIFY',
        draftId: draft.id,
        missingFields: missing,
        question: this.question(missing, parsed.kind),
      };
    }

    const origin = { now, timeZone, rawText: text, forwarded: false };
    const report =
      parsed.kind === 'READING'
        ? await this.reports.saveReading(
            student,
            {
              bookTitle: parsed.book_title ?? '',
              pages: parsed.pages,
              summary: parsed.summary ?? '',
              newWords: parsed.new_words,
            },
            origin,
          )
        : await this.reports.saveListening(
            student,
            {
              sourceTitle: parsed.source_title,
              episode: parsed.episode,
              firstPassPct: parsed.first_pass_pct,
              secondPassPct: parsed.second_pass_pct,
              listenCount: parsed.listen_count,
              retelling: parsed.retelling,
              unclearParts: parsed.unclear_parts,
              newWords: parsed.new_words,
            },
            origin,
          );
    if (student.dialogState.reportDraft) {
      await this.students.patchDialogState(student, { reportDraft: undefined });
    }
    this.authenticity.checkLater(report, student);

    const words = await this.saveWords(student, report, parsed, type);
    const weekProgress = await this.reports.weekProgress(student.id, now, timeZone);
    return { status: 'SAVED', report, weekProgress, words };
  }

  private async saveWords(
    student: Student,
    report: Report,
    parsed: ParsedReport,
    type: ReportType,
  ): Promise<{ added: string[]; alreadyHad: string[] }> {
    if (parsed.new_words.length === 0) return { added: [], alreadyHad: [] };
    const source =
      type === ReportType.READING
        ? WordSource.READING
        : report.method === ListeningMethod.SERIES
          ? WordSource.SERIES
          : WordSource.PODCAST;
    const result = await this.words.addWords(
      student,
      parsed.new_words.map((w) => ({ word: w, translation: null })),
      { source, sourceReportId: report.id },
    );
    if (result.added.length > 0) {
      await this.reports.setWordsAdded(report.id, result.added.length);
      this.enrichment.enrichLater(
        result.added.map((w) => w.lemma ?? lemmaOf(w.word)),
        student.id,
      );
    }
    return {
      added: result.added.map((w) => w.word),
      alreadyHad: [...result.existing, ...result.learned].map((w) => w.word),
    };
  }

  private async parse(student: Student, type: ReportType, text: string): Promise<ParsedReport> {
    const kind = type === ReportType.READING ? 'READING' : 'LISTENING';
    const model = this.config.aiModelDialog;
    const response = await this.llm.complete({
      model,
      maxTokens: 1024,
      system: [
        { type: 'text', text: PARSE_SYSTEM_PROMPT[kind], cache_control: { type: 'ephemeral' } },
      ],
      tools: [parseTool(kind)],
      toolChoice: { type: 'tool', name: PARSE_TOOL_NAME },
      messages: [{ role: 'user', content: text }],
    });
    await this.usage.record(student.id, AiPurpose.DIALOG, model, response.usage);
    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === PARSE_TOOL_NAME,
    );
    if (!call) {
      this.logger.warn(`report parse returned no tool call for student ${student.id}`);
      throw new AppError({
        level: ErrorLevel.HIGH_INTEGRATION,
        service: ServiceCode.AI,
        error: ErrorCode.INTEGRATION_RESPONSE_INVALID,
      });
    }
    return { kind, ...(call.input as Record<string, unknown>) } as ParsedReport;
  }

  private missing(parsed: ParsedReport, method: ListeningMethod): string[] {
    if (parsed.kind === 'READING') {
      const out: string[] = [];
      if (!(parsed.book_title ?? '').trim()) out.push('book_title');
      if ((parsed.summary ?? '').trim().length < MIN_SUMMARY_CHARS) out.push('summary');
      return out;
    }
    return missingListeningFields(method, {
      sourceTitle: parsed.source_title,
      episode: parsed.episode,
      firstPassPct: parsed.first_pass_pct,
      secondPassPct: parsed.second_pass_pct,
      listenCount: parsed.listen_count,
      retelling: parsed.retelling,
      unclearParts: parsed.unclear_parts,
      newWords: parsed.new_words,
    });
  }

  /** One friendly question covering every missing field. */
  private question(missing: string[], kind: 'READING' | 'LISTENING'): string {
    const labels: Record<string, string> = {
      book_title: 'какую книгу ты читал',
      summary: 'о чём было прочитанное — 2–3 предложения своими словами',
      source_title: 'что именно ты слушал (подкаст или сериал)',
      episode: 'какая серия или эпизод',
      first_pass_pct: 'сколько процентов понял с первого раза',
      second_pass_pct: 'сколько процентов понял после повторного прослушивания',
      listen_count: 'сколько раз слушал',
      retelling: `короткий пересказ своими словами — 2–3 предложения по-английски (не короче ${MIN_RETELLING_CHARS} символов)`,
    };
    const parts = missing.map((f) => labels[f] ?? f);
    const lead =
      kind === 'READING'
        ? 'Спасибо! Чтобы засчитать чтение, напиши ещё'
        : 'Спасибо! Для твоего уровня нужно ещё';
    return `${lead}: ${parts.join('; ')}.`;
  }

  private async assertDailyLimit(
    student: Student,
    type: ReportType,
    now: Date,
    timeZone: string,
  ): Promise<void> {
    if (await this.reports.dailyLimitReached(student.id, type, now, timeZone)) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.REPORTS,
        error: ErrorCode.DAILY_LIMIT_REACHED,
        meta: { type },
      });
    }
  }

  /** For the form: which fields the student's method requires. */
  requiredFor(
    student: Student,
    type: ReportType,
  ): readonly (ListeningField | 'book_title' | 'summary')[] {
    return type === ReportType.READING
      ? ['book_title', 'summary']
      : requiredListeningFields(listeningMethodFor(student.level));
  }
}
