import type Anthropic from '@anthropic-ai/sdk';

/**
 * Port to the language model. The domain works with SDK *types* only; the
 * client itself lives in infra/ai. Tests use a fake.
 */
export const LLM_PORT = Symbol('LLM_PORT');

export interface LlmRequest {
  model: string;
  maxTokens: number;
  system: Anthropic.TextBlockParam[];
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
  /** Force a specific tool (structured output); omitted = auto. */
  toolChoice?: Anthropic.ToolChoice;
}

export interface LlmPort {
  complete(request: LlmRequest): Promise<Anthropic.Message>;
}
