import type Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/config.service';
import { AiPurpose } from '../ai-log/ai-usage.entity';
import { LLM_PORT, LlmPort } from './llm.port';
import {
  SENTENCE_SYSTEM_PROMPT,
  SENTENCE_TOOL,
  SENTENCE_TOOL_NAME,
  SentenceVerdict,
} from './sentence-check.prompt';
import { UsageService } from './usage.service';

/**
 * Stage-3 cards: is the word used in its meaning? One forced-tool call.
 * If the model is unavailable the answer counts as correct — an outage must
 * never cost the student a card.
 */
@Injectable()
export class SentenceCheckService {
  private readonly logger = new Logger(SentenceCheckService.name);

  constructor(
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    private readonly usage: UsageService,
    private readonly config: AppConfigService,
  ) {}

  async check(
    studentId: string,
    word: { word: string; translation: string | null },
    sentence: string,
  ): Promise<SentenceVerdict> {
    const model = this.config.aiModelDialog;
    try {
      const response = await this.llm.complete({
        model,
        maxTokens: 300,
        system: [
          { type: 'text', text: SENTENCE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        tools: [SENTENCE_TOOL],
        toolChoice: { type: 'tool', name: SENTENCE_TOOL_NAME },
        messages: [
          {
            role: 'user',
            content: JSON.stringify({ word: word.word, translation: word.translation, sentence }),
          },
        ],
      });
      await this.usage.record(studentId, AiPurpose.SENTENCE_CHECK, model, response.usage);
      const call = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === SENTENCE_TOOL_NAME,
      );
      if (!call) return { ok: true, feedback: null };
      const input = call.input as Partial<SentenceVerdict>;
      return {
        ok: input.ok !== false,
        feedback:
          typeof input.feedback === 'string' && input.feedback.trim()
            ? input.feedback.trim()
            : null,
      };
    } catch (err) {
      this.logger.warn(
        `sentence check unavailable, counting as correct: ${(err as Error).message}`,
      );
      return { ok: true, feedback: null };
    }
  }
}
