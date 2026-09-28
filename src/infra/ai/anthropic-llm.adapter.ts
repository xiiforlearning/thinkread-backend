import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { AppConfigService } from '../../config/config.service';
import { LlmPort, LlmRequest } from '../../domain/ai/llm.port';

/**
 * Claude via the official SDK. Retries (429/5xx) and timeouts are the SDK's;
 * typed errors are mapped to AppError codes so callers can show a friendly
 * message and the owner alert can aggregate by code.
 */
@Injectable()
export class AnthropicLlmAdapter implements LlmPort {
  private readonly logger = new Logger(AnthropicLlmAdapter.name);
  private readonly client: Anthropic;

  constructor(config: AppConfigService) {
    this.client = new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 2, timeout: 60_000 });
  }

  async complete(request: LlmRequest): Promise<Anthropic.Message> {
    try {
      return await this.client.messages.create({
        model: request.model,
        max_tokens: request.maxTokens,
        system: request.system,
        tools: request.tools,
        messages: request.messages,
      });
    } catch (err) {
      throw this.toAppError(err);
    }
  }

  private toAppError(err: unknown): AppError {
    const base = { service: ServiceCode.AI, cause: err };
    if (err instanceof Anthropic.RateLimitError) {
      return new AppError({
        ...base,
        level: ErrorLevel.HIGH_INTEGRATION,
        error: ErrorCode.AI_RATE_LIMITED,
      });
    }
    if (
      err instanceof Anthropic.APIConnectionError ||
      (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500)
    ) {
      return new AppError({
        ...base,
        level: ErrorLevel.HIGH_INTEGRATION,
        error: ErrorCode.AI_UNAVAILABLE,
      });
    }
    if (err instanceof Anthropic.APIError) {
      // 4xx other than 429: our request is wrong — a bug, not an outage.
      this.logger.error(`Claude API ${err.status}: ${err.message}`);
      return new AppError({
        ...base,
        level: ErrorLevel.HIGH_FUNCTIONAL,
        error: ErrorCode.INTEGRATION_FAILURE,
      });
    }
    return new AppError({ ...base, level: ErrorLevel.HIGH_FUNCTIONAL, error: ErrorCode.UNKNOWN });
  }
}
