/**
 * Intent eval for the student dialog: does the model call the expected tool
 * (or none) for a set of real-looking messages? Runs against the real API and
 * spends tokens, so it is not part of `pnpm test`.
 *
 *   ANTHROPIC_API_KEY=... pnpm ai:eval
 *
 * Cases live in scripts/ai-eval.cases.json. Add a case whenever a prompt or
 * tool changes behaviour; the pass threshold is 95%.
 */
import 'reflect-metadata';
import Anthropic from '@anthropic-ai/sdk';
import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { GroupLevel } from '../src/domain/groups/level';
import { TOOL_CLASSES } from '../src/domain/ai/ai.module';
import { buildStateBlock, buildSystemPrompt } from '../src/domain/ai/system.prompt';
import { AgentTool, toApiTool } from '../src/domain/ai/tool';
import { listeningMethodFor } from '../src/domain/groups/level';

loadEnv();

interface EvalCase {
  message: string;
  /** Tool the first model turn must call, or null for a plain text answer. */
  expectTool: string | null;
  level?: GroupLevel;
}

const PASS_THRESHOLD = 0.95;

async function main(): Promise<void> {
  const cases: EvalCase[] = JSON.parse(readFileSync(join(__dirname, 'ai-eval.cases.json'), 'utf8'));
  const model = process.env.AI_MODEL_DIALOG ?? 'claude-haiku-4-5';
  const client = new Anthropic();

  // Tools are only needed for their schemas here; handlers are never run, so
  // they are constructed without their dependencies.
  const tools: AgentTool[] = TOOL_CLASSES.map((C) => new (C as unknown as new () => AgentTool)()).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  const apiTools = tools.map(toApiTool);
  apiTools[apiTools.length - 1].cache_control = { type: 'ephemeral' };
  const system = buildSystemPrompt(tools);

  let passed = 0;
  const failures: string[] = [];
  let tokens = 0;

  for (const c of cases) {
    const level = c.level ?? GroupLevel.INTERMEDIATE;
    const state = buildStateBlock({
      displayName: 'Акмаль Хадиев',
      level,
      method: listeningMethodFor(level),
      localDate: '2026-10-01',
      weekday: 'четверг',
      lines: [
        'Нормы этой недели: чтение 1/3, аудирование 0/3.',
        'Сегодня ещё не напоминали о: READING, LISTENING, CARDS (напоминать только если норма по пункту не выполнена).',
      ],
    });
    const res = await client.messages.create({
      model,
      max_tokens: 512,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: apiTools,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: state },
            { type: 'text', text: c.message },
          ],
        },
      ],
    });
    tokens +=
      res.usage.input_tokens +
      res.usage.output_tokens +
      (res.usage.cache_read_input_tokens ?? 0) +
      (res.usage.cache_creation_input_tokens ?? 0);
    const called =
      res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')?.name ?? null;
    const ok = called === c.expectTool;
    if (ok) passed += 1;
    else
      failures.push(
        `✗ "${c.message}" → expected ${c.expectTool ?? 'no tool'}, got ${called ?? 'no tool'}`,
      );
    process.stdout.write(ok ? '.' : 'F');
  }

  const rate = passed / cases.length;
  process.stdout.write(
    `\n${passed}/${cases.length} (${(rate * 100).toFixed(0)}%), ~${tokens} tokens\n`,
  );
  failures.forEach((f) => process.stdout.write(`${f}\n`));
  process.exit(rate >= PASS_THRESHOLD ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
