import type Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { LlmPort, LlmRequest } from '../../domain/ai/llm.port';
import { lastUserText, simulateReply } from '../../domain/ai/simulate';
import { simulateTool } from '../../domain/ai/skills';

/**
 * Deterministic stand-in for Claude when there is no API key (`AI_MODE=fake`).
 * It answers every forced-tool call with plausible, rule-based output so the
 * whole product — report intake, enrichment, authenticity, spot checks — runs
 * locally and in CI without spending tokens. Not a model: nothing it says
 * should be read as a verdict, and it never leaves the fake mode.
 */
@Injectable()
export class FakeLlmAdapter implements LlmPort {
  private readonly logger = new Logger(FakeLlmAdapter.name);
  private counter = 0;

  constructor() {
    this.logger.warn(
      'AI_MODE=fake — Claude is replaced by a rule-based stub; no API calls are made',
    );
  }

  async complete(request: LlmRequest): Promise<Anthropic.Message> {
    const forced = request.toolChoice?.type === 'tool' ? request.toolChoice.name : null;
    const text = lastUserText(request.messages);
    const tool = request.tools.find((t) => t.name === forced);
    const content: Anthropic.ContentBlock[] = tool
      ? [this.toolUse(tool.name, this.answer(tool, text))]
      : [{ type: 'text', text: simulateReply(text), citations: null }];
    return this.message(request.model, content, tool ? 'tool_use' : 'end_turn', text.length);
  }

  private answer(tool: Anthropic.Tool, text: string): Record<string, unknown> {
    return simulateTool(tool, text);
  }

  private toolUse(name: string, input: Record<string, unknown>): Anthropic.ToolUseBlock {
    this.counter += 1;
    return {
      type: 'tool_use',
      id: `fake_${this.counter}`,
      name,
      input,
      caller: { type: 'direct' },
    };
  }

  private message(
    model: string,
    content: Anthropic.ContentBlock[],
    stopReason: 'tool_use' | 'end_turn',
    inputChars: number,
  ): Anthropic.Message {
    const usage = {
      input_tokens: Math.ceil(inputChars / 4),
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: null,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
    };
    this.counter += 1;
    // The SDK's Message type grows with every release; only the fields the
    // domain reads are meaningful here.
    return {
      id: `msg_fake_${this.counter}`,
      type: 'message',
      role: 'assistant',
      model,
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage,
      container: null,
    } as unknown as Anthropic.Message;
  }
}

export {
  enrich,
  extractWords,
  fillSchema,
  gradeSentence,
  gradeSpotCheck,
  lastUserText,
  parseListening,
  parseReading,
  verdict,
} from '../../domain/ai/simulate';
