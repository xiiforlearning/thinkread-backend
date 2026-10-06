import type Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/config.service';
import { AiPurpose } from '../ai-log/ai-usage.entity';
import { LexiconService } from '../words/lexicon.service';
import { CefrLevel } from '../words/word.enums';
import { WordsService } from '../words/words.service';
import {
  ENRICH_SYSTEM_PROMPT,
  ENRICH_TOOL,
  ENRICH_TOOL_NAME,
  EnrichedWord,
} from './enrichment.prompt';
import { LLM_PORT, LlmPort } from './llm.port';
import { UsageService } from './usage.service';

const BATCH = 25;

/**
 * Fills the shared lexicon for lemmas it does not know yet (one model call
 * per batch, paid once per word for the whole school) and then copies
 * translation / example / CEFR into every student's word rows that lack them.
 */
@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    private readonly usage: UsageService,
    private readonly lexicon: LexiconService,
    private readonly words: WordsService,
    private readonly config: AppConfigService,
  ) {}

  /** Fire-and-forget for bulk imports. */
  enrichLater(lemmas: string[], studentId: string | null): void {
    void this.enrich(lemmas, studentId).catch((err: Error) => {
      this.logger.warn(`enrichment failed for ${lemmas.length} lemmas: ${err.message}`);
    });
  }

  /** Enrich what is missing, then apply the lexicon to the words. Returns how many lemmas were fetched. */
  async enrich(lemmas: string[], studentId: string | null): Promise<number> {
    const unique = [...new Set(lemmas.filter((l) => l.length > 0))];
    const missing = await this.lexicon.missing(unique);
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH);
      const rows = await this.askModel(batch, studentId);
      await this.lexicon.upsert(
        rows.map((r) => ({
          lemma: r.lemma,
          translation: r.translation,
          examples: r.examples,
          cefr: r.cefr,
          forms: r.forms,
          gapSentences: r.gap_sentences,
          distractors: r.distractors,
        })),
      );
    }
    await this.words.applyLexicon(unique);
    return missing.length;
  }

  private async askModel(lemmas: string[], studentId: string | null): Promise<EnrichedWord[]> {
    const model = this.config.aiModelDialog;
    const response = await this.llm.complete({
      model,
      maxTokens: 4096,
      system: [{ type: 'text', text: ENRICH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [ENRICH_TOOL],
      toolChoice: { type: 'tool', name: ENRICH_TOOL_NAME },
      messages: [{ role: 'user', content: JSON.stringify({ lemmas }) }],
    });
    await this.usage.record(studentId, AiPurpose.ENRICH_WORDS, model, response.usage);
    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === ENRICH_TOOL_NAME,
    );
    if (!call) return [];
    const asked = new Set(lemmas);
    const cefr = new Set<string>(Object.values(CefrLevel));
    return (call.input as { words: EnrichedWord[] }).words
      .filter((w) => asked.has(w.lemma))
      .map((w) => ({ ...w, cefr: cefr.has(w.cefr) ? w.cefr : CefrLevel.B1 }));
  }
}
