import type Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { AppConfigService } from '../../config/config.service';
import { AiPurpose } from '../ai-log/ai-usage.entity';
import { LLM_PORT, LlmPort } from './llm.port';
import {
  SCHOOL_CHAT_SYSTEM_PROMPT,
  SCHOOL_REPLY_TOOL,
  SCHOOL_REPLY_TOOL_NAME,
  SchoolReply,
} from './school-chat.prompt';
import { SchoolFactsService, SchoolScope } from './school-facts.service';
import { ChatTurn } from './teacher-chat.service';
import { UsageService } from './usage.service';

const MAX_HISTORY = 10;

/**
 * The school-wide AI (dashboard, stage B1): one forced-tool call over the facts of the whole
 * school (owner) or the caller's groups (teacher). Nothing is stored; usage is logged without a
 * student (AiPurpose.SCHOOL_CHAT).
 */
@Injectable()
export class SchoolChatService {
  private readonly logger = new Logger(SchoolChatService.name);

  constructor(
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    private readonly usage: UsageService,
    private readonly facts: SchoolFactsService,
    private readonly config: AppConfigService,
  ) {}

  async ask(
    scope: SchoolScope,
    question: string,
    history: ChatTurn[] = [],
    now = new Date(),
  ): Promise<SchoolReply> {
    const facts = await this.facts.collect(scope, now);
    const payload = { facts, history: history.slice(-MAX_HISTORY), question: question.trim() };
    const model = this.config.aiModelDialog;
    const response = await this.llm.complete({
      model,
      maxTokens: 1024,
      system: [
        { type: 'text', text: SCHOOL_CHAT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [SCHOOL_REPLY_TOOL],
      toolChoice: { type: 'tool', name: SCHOOL_REPLY_TOOL_NAME },
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    });
    await this.usage.record(null, AiPurpose.SCHOOL_CHAT, model, response.usage);
    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && b.name === SCHOOL_REPLY_TOOL_NAME,
    );
    const input = (call?.input ?? {}) as { text?: unknown };
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text) {
      this.logger.warn('school chat: empty reply from the model');
      throw new AppError({
        level: ErrorLevel.HIGH_INTEGRATION,
        service: ServiceCode.AI,
        error: ErrorCode.AI_UNAVAILABLE,
      });
    }
    return { text };
  }
}
