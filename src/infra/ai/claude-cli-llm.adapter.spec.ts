import type Anthropic from '@anthropic-ai/sdk';
import { SENTENCE_TOOL, SENTENCE_TOOL_NAME } from '../../domain/ai/sentence-check.prompt';
import {
  childEnv,
  ClaudeCliLlmAdapter,
  cliModelFor,
  CliRunner,
  describeFailure,
  extractJson,
  parseCliOutput,
  renderTranscript,
} from './claude-cli-llm.adapter';

const config = {
  claudeCliPath: 'claude',
  claudeCliModel: undefined,
  claudeCliTimeoutMs: 1000,
} as never;

function adapter(
  output: Record<string, unknown>,
  code = 0,
): { llm: ClaudeCliLlmAdapter; calls: string[][] } {
  const calls: string[][] = [];
  const runner: CliRunner = async (args) => {
    calls.push(args);
    return { code, stdout: JSON.stringify(output), stderr: '' };
  };
  return { llm: new ClaudeCliLlmAdapter(config, runner), calls };
}

describe('ClaudeCliLlmAdapter', () => {
  it('turns a forced tool into --json-schema and maps structured_output to tool_use', async () => {
    const { llm, calls } = adapter({
      type: 'result',
      is_error: false,
      result: '',
      structured_output: { ok: true, feedback: null },
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const msg = await llm.complete({
      model: 'claude-haiku-4-5',
      maxTokens: 100,
      system: [{ type: 'text', text: 'SYS' }],
      tools: [SENTENCE_TOOL],
      toolChoice: { type: 'tool', name: SENTENCE_TOOL_NAME },
      messages: [
        { role: 'user', content: '{"word":"postpone","sentence":"I had to postpone it."}' },
      ],
    });
    expect(calls[0]).toEqual(
      expect.arrayContaining(['-p', '--output-format', 'json', '--json-schema']),
    );
    expect(calls[0][calls[0].indexOf('--model') + 1]).toBe('haiku');
    expect(msg.stop_reason).toBe('tool_use');
    const block = msg.content[0] as Anthropic.ToolUseBlock;
    expect(block.name).toBe(SENTENCE_TOOL_NAME);
    expect(block.input).toEqual({ ok: true, feedback: null });
    expect(msg.usage.input_tokens).toBe(10);
  });

  it('falls back to JSON inside the text result and to plain text for dialog', async () => {
    const { llm } = adapter({ result: 'Вот: {"ok": false, "feedback": "x"} конец' });
    const msg = await llm.complete({
      model: 'm',
      maxTokens: 1,
      system: [],
      tools: [SENTENCE_TOOL],
      toolChoice: { type: 'tool', name: SENTENCE_TOOL_NAME },
      messages: [{ role: 'user', content: 'x' }],
    });
    expect((msg.content[0] as Anthropic.ToolUseBlock).input).toEqual({ ok: false, feedback: 'x' });

    const dialog = adapter({ result: 'Привет!' });
    const reply = await dialog.llm.complete({
      model: 'm',
      maxTokens: 1,
      system: [],
      tools: [],
      messages: [{ role: 'user', content: 'привет' }],
    });
    expect(reply.stop_reason).toBe('end_turn');
    expect(reply.content[0]).toMatchObject({ type: 'text', text: 'Привет!' });
  });

  it('a dialog envelope with a tool becomes a tool_use block', async () => {
    const { llm } = adapter({ structured_output: { text: null, tool: 'get_progress', input: {} } });
    const msg = await llm.complete({
      model: 'm',
      maxTokens: 1,
      system: [],
      tools: [
        {
          name: 'get_progress',
          description: 'd',
          input_schema: { type: 'object', properties: {} },
        },
      ],
      messages: [{ role: 'user', content: 'как дела?' }],
    });
    expect(msg.stop_reason).toBe('tool_use');
    expect((msg.content[0] as Anthropic.ToolUseBlock).name).toBe('get_progress');
  });

  it('raises AI_UNAVAILABLE on a CLI error with the remedy in the message', async () => {
    const { llm } = adapter({ is_error: true, result: 'Authentication error' }, 0);
    await expect(
      llm.complete({
        model: 'm',
        maxTokens: 1,
        system: [],
        tools: [],
        messages: [{ role: 'user', content: 'x' }],
      }),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/310$/),
      message: expect.stringContaining('claude login'),
    });
    expect(describeFailure(1, null, "error: unknown option '--bare'\n")).toContain('claude update');
    expect(describeFailure(-1, null, 'spawn claude ENOENT')).toContain('CLAUDE_CLI_PATH');
  });

  it('maps API model ids to CLI aliases and lets CLAUDE_CLI_MODEL win', () => {
    expect(cliModelFor('claude-haiku-4-5', undefined)).toBe('haiku');
    expect(cliModelFor('claude-sonnet-5-5', undefined)).toBe('sonnet');
    expect(cliModelFor('claude-haiku-4-5', 'opus')).toBe('opus');
    expect(cliModelFor('custom', undefined)).toBe('custom');
  });

  it('drops an empty ANTHROPIC_API_KEY and the nested-session marker from the child env', () => {
    const env = childEnv({
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_BASE_URL: 'x',
      CLAUDECODE: '1',
      PATH: 'p',
    });
    expect(env).toEqual({ ANTHROPIC_BASE_URL: 'x', PATH: 'p' });
    expect(childEnv({ ANTHROPIC_API_KEY: 'sk' }).ANTHROPIC_API_KEY).toBe('sk');
  });

  it('helpers: parse noisy output, extract json, render transcripts', () => {
    expect(parseCliOutput('log line\n{"result":"ok"}\n')).toEqual({ result: 'ok' });
    expect(parseCliOutput('garbage')).toBeNull();
    expect(extractJson('see {"a":1}.')).toEqual({ a: 1 });
    const text = renderTranscript([
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: '1', name: 't', input: { q: 1 } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: '1', content: 'done' }] },
    ]);
    expect(text).toContain('Студент: hi');
    expect(text).toContain('вызвал инструмент t');
    expect(text).toContain('Результат инструмента: done');
  });
});
