import type Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { AppConfigService } from '../../config/config.service';
import { globalConfig } from '../../config/global.config';
import { AiPurpose } from '../ai-log/ai-usage.entity';
import { FlagKind } from '../flags/flag.enums';
import { FlagsService } from '../flags/flags.service';
import { ListeningMethod, listeningMethodFor } from '../groups/level';
import {
  ListeningField,
  MIN_RETELLING_CHARS,
  missingListeningFields,
  requiredListeningFields,
} from '../reports/listening-fields';
import { Report, ReportType } from '../reports/report.entity';
import { ReportsService, WeekProgress } from '../reports/reports.service';
import { Lang, langOf } from '../students/language';
import { Student } from '../students/student.entity';
import { DraftWord, ReportDraft } from '../students/student.enums';
import { StudentsService } from '../students/students.service';
import { displayWord, isEnglishWord, lemmaOf } from '../words/normalize';
import { WordSource } from '../words/word.enums';
import { NewWordInput, WordsService } from '../words/words.service';
import { AuthenticityService } from './authenticity.service';
import { EnrichmentService } from './enrichment.service';
import { LLM_PORT, LlmPort } from './llm.port';
import { dedupeText } from './report-text';
import {
  PARSE_SYSTEM_PROMPT,
  PARSE_TOOL_NAME,
  ParsedReport,
  parseTool,
} from './report-intake.prompt';
import { ReportWordsService } from './report-words.service';
import { UsageService } from './usage.service';

const MIN_SUMMARY_CHARS = 20;
/** A clarification question is answered within a day; a confirmation screen never expires. */
const CLARIFY_TTL_MS = 24 * 3_600_000;

export interface WordsToConfirm {
  draftId: string;
  type: ReportType;
  /** The student wrote an explicit list; false = the screen asks "any new words?". */
  hasList: boolean;
  words: DraftWord[];
  /** Words beyond `words.maxPerReport` left out of the list. */
  dropped: number;
  minWords: number;
  maxWords: number;
}

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
    }
  | ({ status: 'CONFIRM_WORDS' } & WordsToConfirm);

/**
 * Report intake for the Mini App form: one structured model call for the fields, one for the
 * student's explicit word list, then the same rules as the chat tools (daily limit, required
 * fields per method). The report is saved only when the student confirms the word list
 * (customer decision 02.11.2026): until then it lives as a draft in dialog_state and counts for
 * nothing — so cancelling the confirmation cannot produce a counted report without words.
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
    private readonly reportWords: ReportWordsService,
    private readonly flags: FlagsService,
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
    return this.process(student, type, text.trim(), now);
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
      (draft.stage ?? 'CLARIFY') !== 'CLARIFY' ||
      now.getTime() - new Date(draft.createdAt).getTime() > CLARIFY_TTL_MS
    ) {
      throw this.noDraft(draftId);
    }
    const type = this.typeOf(draft);
    await this.assertDailyLimit(student, type, now, timeZone);
    return this.process(student, type, `${draft.text}\n\n${answer.trim()}`, now);
  }

  /**
   * The student confirmed the word list: the report is saved and counted, the words added.
   * `chosen` is the list as left on the screen (unticked words removed, typed ones added);
   * undefined = the extracted list minus duplicates. Fewer words than `norms.minWordsPerReport`
   * is refused; an empty list is accepted and marked "без новых слов".
   */
  async confirm(
    student: Student,
    draftId: string,
    chosen: NewWordInput[] | undefined,
    now: Date,
    timeZone: string,
  ): Promise<IntakeResult> {
    const draft = student.dialogState.reportDraft;
    if (!draft || draft.id !== draftId || draft.stage !== 'CONFIRM_WORDS' || !draft.parsed) {
      throw this.noDraft(draftId);
    }
    const type = this.typeOf(draft);
    await this.assertDailyLimit(student, type, now, timeZone);
    const words = this.cleanWords(chosen ?? (draft.words ?? []).filter((w) => !w.duplicate));
    const minWords = globalConfig.norms.minWordsPerReport;
    if (words.length < minWords) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.REPORTS,
        error: ErrorCode.WORDS_REQUIRED,
        meta: { minWords, got: words.length },
      });
    }

    const parsed = draft.parsed as unknown as ParsedReport;
    const origin = {
      now,
      timeZone,
      rawText: draft.text,
      forwarded: false,
      noNewWords: words.length === 0,
    };
    const newWords = words.map((w) => w.word);
    const report =
      parsed.kind === 'READING'
        ? await this.reports.saveReading(
            student,
            {
              bookTitle: parsed.book_title ?? '',
              pages: parsed.pages,
              summary: parsed.summary ?? '',
              newWords,
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
              newWords,
            },
            origin,
          );
    await this.students.patchDialogState(student, { reportDraft: undefined });
    this.authenticity.checkLater(report, student);

    const added = await this.saveWords(student, report, words, type);
    if (origin.noNewWords) await this.flagNoNewWords(student, report);
    const weekProgress = await this.reports.weekProgress(student.id, now, timeZone);
    return { status: 'SAVED', report, weekProgress, words: added };
  }

  /** "Back to the report": the draft is dropped, nothing was counted. */
  async discard(student: Student, draftId: string): Promise<void> {
    const draft = student.dialogState.reportDraft;
    if (!draft || draft.id !== draftId) throw this.noDraft(draftId);
    await this.students.patchDialogState(student, { reportDraft: undefined });
  }

  /** The report in progress, for the Mini App to resume after a reload; null when none. */
  current(student: Student, now: Date): IntakeResult | null {
    const draft = student.dialogState.reportDraft;
    if (!draft) return null;
    if (draft.stage === 'CONFIRM_WORDS') return this.confirmView(draft);
    if (now.getTime() - new Date(draft.createdAt).getTime() > CLARIFY_TTL_MS) return null;
    return {
      status: 'CLARIFY',
      draftId: draft.id,
      missingFields: draft.missingFields,
      question: this.question(draft.missingFields, draft.type, langOf(student)),
    };
  }

  private async process(
    student: Student,
    type: ReportType,
    rawText: string,
    now: Date,
  ): Promise<IntakeResult> {
    // A message sent twice or a clarification answered twice must not read as a "repeated
    // retelling" or inflate the text: the student's duplicates are dropped before anything else.
    const text = dedupeText(rawText);
    const parsed = await this.parse(student, type, text);
    const missing = this.missing(parsed, listeningMethodFor(student.level));
    if (missing.length > 0) {
      const draft: ReportDraft = {
        id: randomUUID(),
        type: parsed.kind,
        text,
        missingFields: missing,
        createdAt: now.toISOString(),
        stage: 'CLARIFY',
      };
      await this.students.patchDialogState(student, { reportDraft: draft });
      return {
        status: 'CLARIFY',
        draftId: draft.id,
        missingFields: missing,
        question: this.question(missing, parsed.kind, langOf(student)),
      };
    }

    // The fields are complete: the student's own word list goes to the confirmation screen.
    const extracted = await this.reportWords.extract(student, text);
    const owned = await this.words.ownedLemmas(student.id);
    const draft: ReportDraft = {
      id: randomUUID(),
      type: parsed.kind,
      text,
      missingFields: [],
      createdAt: now.toISOString(),
      stage: 'CONFIRM_WORDS',
      parsed: parsed as unknown as Record<string, unknown>,
      words: extracted.items.map((w) => ({
        word: w.word,
        translation: w.translation,
        duplicate: owned.has(lemmaOf(w.word)),
      })),
      hasList: extracted.hasList,
      droppedWords: extracted.dropped,
    };
    await this.students.patchDialogState(student, { reportDraft: draft });
    return this.confirmView(draft);
  }

  private confirmView(draft: ReportDraft): IntakeResult {
    return {
      status: 'CONFIRM_WORDS',
      draftId: draft.id,
      type: this.typeOf(draft),
      hasList: draft.hasList ?? false,
      words: draft.words ?? [],
      dropped: draft.droppedWords ?? 0,
      minWords: globalConfig.norms.minWordsPerReport,
      maxWords: globalConfig.words.maxPerReport,
    };
  }

  /** English only, one per lemma, within the per-report cap, translations trimmed. */
  private cleanWords(inputs: NewWordInput[]): Array<{ word: string; translation: string | null }> {
    const seen = new Set<string>();
    const out: Array<{ word: string; translation: string | null }> = [];
    for (const input of inputs) {
      const word = displayWord(input.word);
      const lemma = lemmaOf(word);
      if (!lemma || !isEnglishWord(word) || seen.has(lemma)) continue;
      seen.add(lemma);
      out.push({ word, translation: displayWord(input.translation ?? '') || null });
      if (out.length >= globalConfig.words.maxPerReport) break;
    }
    return out;
  }

  private async saveWords(
    student: Student,
    report: Report,
    words: Array<{ word: string; translation: string | null }>,
    type: ReportType,
  ): Promise<{ added: string[]; alreadyHad: string[] }> {
    if (words.length === 0) return { added: [], alreadyHad: [] };
    const source =
      type === ReportType.READING
        ? WordSource.READING
        : report.method === ListeningMethod.SERIES
          ? WordSource.SERIES
          : WordSource.PODCAST;
    const result = await this.words.addWords(student, words, { source, sourceReportId: report.id });
    if (result.added.length > 0) {
      await this.reports.setWordsAdded(report.id, result.added.length);
      report.wordsAdded = result.added.length;
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

  /** Several reports in a row without a single new word: a quiet card for the teacher. */
  private async flagNoNewWords(student: Student, report: Report): Promise<void> {
    const after = globalConfig.norms.noNewWordsFlagAfter;
    const latest = await this.reports.history(student.id, after);
    if (latest.length < after || !latest.every((r) => r.noNewWords)) return;
    await this.flags.raise({
      studentId: student.id,
      reportId: report.id,
      kind: FlagKind.NO_NEW_WORDS,
      reason: `${after} отчёта подряд без новых слов.`,
    });
  }

  private typeOf(draft: ReportDraft): ReportType {
    return draft.type === 'READING' ? ReportType.READING : ReportType.LISTENING;
  }

  private noDraft(draftId: string): AppError {
    return new AppError({
      level: ErrorLevel.LOW_BUSINESS,
      service: ServiceCode.REPORTS,
      error: ErrorCode.NOT_FOUND,
      meta: { draftId },
    });
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
      newWords: [],
    });
  }

  /** One friendly question covering every missing field, in the student's language. */
  private question(missing: string[], kind: 'READING' | 'LISTENING', lang: Lang): string {
    if (lang === 'en') {
      const labelsEn: Record<string, string> = {
        book_title: 'which book you read',
        summary: 'what it was about — 2–3 sentences in your own words',
        source_title: 'what exactly you listened to (the podcast or series)',
        episode: 'which episode',
        first_pass_pct: 'what percent you understood the first time',
        second_pass_pct: 'what percent you understood after listening again',
        listen_count: 'how many times you listened',
        retelling: `a short retelling in your own words — 2–3 sentences in English (at least ${MIN_RETELLING_CHARS} characters)`,
      };
      const partsEn = missing.map((f) => labelsEn[f] ?? f);
      const leadEn =
        kind === 'READING'
          ? 'Thanks! To count the reading, please add'
          : 'Thanks! For your level we also need';
      return `${leadEn}: ${partsEn.join('; ')}.`;
    }
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
