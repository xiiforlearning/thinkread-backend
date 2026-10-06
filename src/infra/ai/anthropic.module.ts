import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/config.module';
import { AppConfigService } from '../../config/config.service';
import { LLM_PORT, LlmPort } from '../../domain/ai/llm.port';
import { AnthropicLlmAdapter } from './anthropic-llm.adapter';
import { ClaudeCliLlmAdapter } from './claude-cli-llm.adapter';
import { FakeLlmAdapter } from './fake-llm.adapter';

/**
 * Global so domain modules inject LLM_PORT without importing infra.
 * AI_MODE picks the adapter: `anthropic` (API key), `claude-cli` (local Claude
 * Code CLI, no key) or `fake` (rule-based stub).
 */
@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: LLM_PORT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): LlmPort => {
        switch (config.aiMode) {
          case 'fake':
            return new FakeLlmAdapter();
          case 'claude-cli':
            return new ClaudeCliLlmAdapter(config);
          default:
            return new AnthropicLlmAdapter(config);
        }
      },
    },
  ],
  exports: [LLM_PORT],
})
export class AnthropicModule {}
