import type Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/config.service';
import { globalConfig } from '../../config/global.config';
import { AiPurpose } from '../ai-log/ai-usage.entity';
import { Student } from '../students/student.entity';
import {
  displayWord,
  extractWordList,
  isEnglishWord,
  lemmaOf,
  ParsedWordLine,
} from '../words/normalize';
import { LLM_PORT, LlmPort } from './llm.port';
import {
  REPORT_WORDS_SYSTEM_PROMPT,
  REPORT_WORDS_TOOL,
  REPORT_WORDS_TOOL_NAME,
  ReportWords,
} from './report-words.prompt';
import { UsageService } from './usage.service';

export interface ExtractedWords {
  /** The student wrote an explicit list (a heading, "word — translation" lines, a column). */
  hasList: boolean;
  items: ParsedWordLine[];
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
      result = { has_list: hasList, items };
    }
    return this.clean(result);
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

  /** English only, one per lemma, within the per-report cap. */
  private clean(result: ReportWords): ExtractedWords {
    const seen = new Set<string>();
    const items: ParsedWordLine[] = [];
    for (const raw of Array.isArray(result.items) ? result.items : []) {
      const word = displayWord(String(raw?.word ?? ''));
      const lemma = lemmaOf(word);
      if (!lemma || !isEnglishWord(word) || seen.has(lemma)) continue;
      seen.add(lemma);
      const translation = displayWord(String(raw.translation ?? '')) || null;
      items.push({ word, translation });
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
