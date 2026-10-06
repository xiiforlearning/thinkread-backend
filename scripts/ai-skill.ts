/**
 * Run one AI skill of the product from the terminal — to tune a prompt or to
 * see what the model (or the simulator) returns for a given text:
 *
 *   pnpm ai:skill                                  # list skills
 *   pnpm ai:skill parse_listening_report "слушал 6 Minute English, 70%, 3 раза …"
 *   pnpm ai:skill sentence_check                   # uses the skill's example text
 *   AI_MODE=claude-cli pnpm ai:skill enrich_words '{"lemmas":["postpone"]}'
 *   AI_MODE=anthropic ANTHROPIC_API_KEY=… pnpm ai:skill authenticity "…"
 *
 * AI_MODE defaults to `fake` without a key (see AppConfigService.aiMode).
 */
import 'reflect-metadata';
import type Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { config as loadEnv } from 'dotenv';
import { AppConfigService } from '../src/config/config.service';
import { LlmPort } from '../src/domain/ai/llm.port';
import { AI_SKILLS, skillByName } from '../src/domain/ai/skills';
import { AnthropicLlmAdapter } from '../src/infra/ai/anthropic-llm.adapter';
import { ClaudeCliLlmAdapter } from '../src/infra/ai/claude-cli-llm.adapter';
import { FakeLlmAdapter } from '../src/infra/ai/fake-llm.adapter';

loadEnv();

async function main(): Promise<void> {
  const [, , name, ...rest] = process.argv;
  if (!name) {
    console.log('AI skills:\n');
    for (const s of AI_SKILLS) console.log(`  ${s.name.padEnd(24)} ${s.title}\n  ${' '.repeat(24)} ${s.description}\n`);
    return;
  }
  const skill = skillByName(name);
  if (!skill) {
    console.error(`unknown skill ${name}; run without arguments to list them`);
    process.exit(1);
  }
  const text = rest.join(' ').trim() || skill.example;
  const config = new AppConfigService(new ConfigService());
  const mode = config.aiMode;
  const llm: LlmPort =
    mode === 'fake'
      ? new FakeLlmAdapter()
      : mode === 'claude-cli'
        ? new ClaudeCliLlmAdapter(config)
        : new AnthropicLlmAdapter(config);

  console.error(`[${mode}] ${skill.title} — ${skill.tool.name}`);
  const started = Date.now();
  const response = await llm.complete({
    model: config.aiModelDialog,
    maxTokens: 4096,
    system: [{ type: 'text', text: skill.system }],
    tools: [skill.tool],
    toolChoice: { type: 'tool', name: skill.tool.name },
    messages: [{ role: 'user', content: text }],
  });
  const call = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  console.log(JSON.stringify(call?.input ?? { error: 'no tool call', content: response.content }, null, 2));
  console.error(
    `${Date.now() - started} ms · tokens in ${response.usage.input_tokens} / out ${response.usage.output_tokens}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
