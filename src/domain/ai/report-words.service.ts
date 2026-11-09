import type Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/config.service';
import { globalConfig } from '../../config/global.config';
import { AiPurpose } from '../ai-log/ai-usage.entity';
import { Student } from '../students/student.entity';
import { isBasicWord } from '../words/basic';
import { displayWord, extractWordList, isEnglishWord, lemmaOf } from '../words/normalize';
import { LLM_PORT, LlmPort } from './llm.port';
import { findQuote, sentenceWith } from './report-text';
import {
  REPORT_WORDS_SYSTEM_PROMPT,
  REPORT_WORDS_TOOL,
  REPORT_WORDS_TOOL_NAME,
  ReportWords,
} from './report-words.prompt';
import { UsageService } from './usage.service';

/** One word of the student's list, with what the report says about it (W6). */
export interface ReportWordLine {
  word: string;
  /** The student's translation, else the AI's translation by the context of this report. */
  translation: string | null;
  /** True when `translation` is the AI's contextual suggestion, not the student's own. */
  suggested: boolean;
  /** The student's own sentence with the word (verified against the text), for the card. */
  context: string | null;
  /** A1 vocabulary: shown unticked, not added unless the student insists. */
  basic: boolean;
}

export interface ExtractedWords {
  /** The student wrote an explicit list (a heading, "word — translation" lines, a column). */
  hasList: boolean;
  items: ReportWordLine[];
  /** Words beyond `words.maxPerReport` that were left out. */
  dropped: number;
}

/**
 * The student's explicit word list out of a report — the only source of dictionary words from
 * reports (customer decision 02.11.2026: nothing is taken from the retelling, nothing is
 * suggested). One forced-tool call on the student's text alone; the model outage falls back to
 * the rule-based extraction so the confirmation screen still opens.
 */
@Injectable()
export class ReportWordsService {
  private readonly logger = new Logger(ReportWordsService.name);

  constructor(
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    private readonly usage: UsageService,
    private readonly config: AppConfigService,
  ) {}

  async extract(student: Student, text: string): Promise<ExtractedWords> {
    let result: ReportWords;
    try {
      result = await this.ask(student, text);
    } catch (err) {
      this.logger.warn(
        `report words extraction failed for student ${student.id}, using the rule-based list: ${String(err)}`,
      );
      const { hasList, items } = extractWordList(text);
      result = {
        has_list: hasList,
        items: items.map((w) => ({
          ...w,
          context: null,
          suggested_translation: null,
          basic: false,
        })),
      };
    }
    return this.clean(result, text);
  }

  private async ask(student: Student, text: string): Promise<ReportWords> {
    const model = this.config.aiModelDialog;
    const response = await this.llm.complete({
      model,
      maxTokens: 1500,
      system: [
        { type: 'text', text: REPORT_WORDS_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [REPORT_WORDS_TOOL],
      toolChoice: { type: 'tool', name: REPORT_WORDS_TOOL_NAME },
      messages: [{ role: 'user', content: text }],
    });
    await this.usage.record(student.id, AiPurpose.REPORT_WORDS, model, response.usage);
    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && b.name === REPORT_WORDS_TOOL_NAME,
    );
    if (!call) throw new Error('no tool call');
    return call.input as ReportWords;
  }

  /**
   * English only, one per lemma, within the per-report cap. The context sentence is kept only
   * when it really is in the student's text (else code looks for one itself); the A1 mark is
   * the model's or the list's.
   */
  private clean(result: ReportWords, text: string): ExtractedWords {
    const seen = new Set<string>();
    const items: ReportWordLine[] = [];
    for (const raw of Array.isArray(result.items) ? result.items : []) {
      const word = displayWord(String(raw?.word ?? ''));
      const lemma = lemmaOf(word);
      if (!lemma || !isEnglishWord(word) || seen.has(lemma)) continue;
      seen.add(lemma);
      const own = displayWord(String(raw.translation ?? '')) || null;
      const suggested = own ? null : displayWord(String(raw.suggested_translation ?? '')) || null;
      const claimed = typeof raw.context === 'string' ? raw.context.trim() : '';
      const context = claimed && findQuote(claimed, text) ? claimed : sentenceWith(text, word);
      items.push({
        word,
        translation: own ?? suggested,
        suggested: !own && suggested !== null,
        context,
        basic: Boolean(raw.basic) || isBasicWord(lemma),
      });
    }
    const max = globalConfig.words.maxPerReport;
    const kept = items.slice(0, max);
    return {
      hasList: Boolean(result.has_list) && kept.length > 0,
      items: kept,
      dropped: items.length - kept.length,
    };
  }
}
