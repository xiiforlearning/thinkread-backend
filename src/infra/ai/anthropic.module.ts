import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/config.module';
import { AppConfigService } from '../../config/config.service';
import { LLM_PORT } from '../../domain/ai/llm.port';
import { AnthropicLlmAdapter } from './anthropic-llm.adapter';
import { FakeLlmAdapter } from './fake-llm.adapter';

/**
 * Global so domain modules inject LLM_PORT without importing infra.
 * `AI_MODE=fake` (or no ANTHROPIC_API_KEY) swaps Claude for the rule-based stub.
 */
@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: LLM_PORT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        config.aiMode === 'fake' ? new FakeLlmAdapter() : new AnthropicLlmAdapter(config),
    },
  ],
  exports: [LLM_PORT],
})
export class AnthropicModule {}
