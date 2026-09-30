import { Global, Module } from '@nestjs/common';
import { LLM_PORT } from '../../domain/ai/llm.port';
import { AnthropicLlmAdapter } from './anthropic-llm.adapter';

/** Global so domain modules inject LLM_PORT without importing infra. */
@Global()
@Module({
  providers: [{ provide: LLM_PORT, useClass: AnthropicLlmAdapter }],
  exports: [LLM_PORT],
})
export class AnthropicModule {}
