import type Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { AppConfigService } from '../../config/config.service';
import { LlmPort, LlmRequest } from '../../domain/ai/llm.port';

/** How the adapter runs the CLI — injectable so tests never spawn anything. */
export type CliRunner = (
  args: string[],
  stdin: string,
  timeoutMs: number,
) => Promise<{ code: number | null; stdout: string; stderr: string }>;

interface CliResult {
  type?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

const ENVELOPE_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: ['string', 'null'] },
    tool: { type: ['string', 'null'] },
    input: { type: ['object', 'null'] },
  },
  required: ['text', 'tool', 'input'],
  additionalProperties: false,
};

/**
 * `AI_MODE=claude-cli`: the model behind LLM_PORT is the Claude Code CLI
 * installed on the machine (`claude -p`), signed in with the developer's own
 * account — no API key. Forced-tool calls become `--json-schema` structured
 * output; free dialog turns answer with a small envelope ({text} or
 * {tool, input}). For local development and demos only: calls run one at a
 * time and take seconds, not milliseconds.
 */
@Injectable()
export class ClaudeCliLlmAdapter implements LlmPort {
  private readonly logger = new Logger(ClaudeCliLlmAdapter.name);
  private queue: Promise<unknown> = Promise.resolve();
  private counter = 0;

  constructor(
    private readonly config: AppConfigService,
    private readonly run: CliRunner = spawnRunner,
  ) {
    this.logger.warn(
      `AI_MODE=claude-cli — the model is the local Claude Code CLI (${config.claudeCliPath})`,
    );
  }

  complete(request: LlmRequest): Promise<Anthropic.Message> {
    // One CLI process at a time: the machine's own account, not a server.
    const next = this.queue.then(() => this.completeNow(request));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async completeNow(request: LlmRequest): Promise<Anthropic.Message> {
    const forced = request.toolChoice?.type === 'tool' ? request.toolChoice.name : null;
    const tool = request.tools.find((t) => t.name === forced) ?? null;
    const system = request.system.map((b) => b.text).join('\n\n');
    const schema = tool ? tool.input_schema : request.tools.length > 0 ? ENVELOPE_SCHEMA : null;
    const systemText = tool
      ? `${system}\n\nОтвет — только JSON по схеме инструмента ${tool.name}.`
      : request.tools.length > 0
        ? `${system}\n\n${toolsAsText(request.tools)}`
        : system;

    const args = [
      '-p',
      // Not --bare: it reads only ANTHROPIC_API_KEY and ignores the claude.ai login this mode
      // exists for. Isolation instead: no settings/hooks, no MCP, no skills; cwd is the temp dir.
      '--setting-sources',
      '',
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--output-format',
      'json',
      '--tools',
      '',
      '--model',
      cliModelFor(request.model, this.config.claudeCliModel),
      '--system-prompt',
      systemText,
      ...(schema ? ['--json-schema', JSON.stringify(schema)] : []),
    ];
    const prompt = renderTranscript(request.messages);
    const { code, stdout, stderr } = await this.run(args, prompt, this.config.claudeCliTimeoutMs);
    const parsed = parseCliOutput(stdout);
    if (code !== 0 || !parsed || parsed.is_error) {
      const detail = describeFailure(code, parsed, stderr);
      this.logger.error(`claude-cli failed: ${detail}`);
      throw new AppError({
        level: ErrorLevel.HIGH_INTEGRATION,
        service: ServiceCode.AI,
        error: ErrorCode.AI_UNAVAILABLE,
        message: `claude-cli: ${detail}`,
      });
    }

    const data = parsed.structured_output ?? extractJson(parsed.result ?? '');
    let content: Anthropic.ContentBlock[];
    let stop: 'tool_use' | 'end_turn' = 'end_turn';
    if (tool) {
      content = [this.toolUse(tool.name, isObject(data) ? data : {})];
      stop = 'tool_use';
    } else if (
      request.tools.length > 0 &&
      isObject(data) &&
      typeof data.tool === 'string' &&
      data.tool
    ) {
      content = [this.toolUse(data.tool, isObject(data.input) ? data.input : {})];
      stop = 'tool_use';
    } else {
      const text =
        isObject(data) && typeof data.text === 'string' ? data.text : (parsed.result ?? '');
      content = [{ type: 'text', text, citations: null }];
    }
    return this.message(request.model, content, stop, parsed.usage);
  }

  private toolUse(name: string, input: Record<string, unknown>): Anthropic.ToolUseBlock {
    this.counter += 1;
    return { type: 'tool_use', id: `cli_${this.counter}`, name, input, caller: { type: 'direct' } };
  }

  private message(
    model: string,
    content: Anthropic.ContentBlock[],
    stopReason: 'tool_use' | 'end_turn',
    usage: CliResult['usage'],
  ): Anthropic.Message {
    this.counter += 1;
    return {
      id: `msg_cli_${this.counter}`,
      type: 'message',
      role: 'assistant',
      model,
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: usage?.input_tokens ?? 0,
        output_tokens: usage?.output_tokens ?? 0,
        cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
        cache_creation: null,
        inference_geo: null,
        output_tokens_details: null,
        server_tool_use: null,
        service_tier: null,
      },
      container: null,
    } as unknown as Anthropic.Message;
  }
}

/* ---------- helpers (exported for tests) ---------- */

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * The CLI takes model aliases (`haiku`, `sonnet`, `opus`) or full ids. `CLAUDE_CLI_MODEL` wins;
 * otherwise the API model of the request is mapped to its alias so the CLI never sees an id it
 * cannot resolve on a subscription account.
 */
export function cliModelFor(requestModel: string, override: string | undefined): string {
  if (override) return override;
  const m = requestModel.toLowerCase();
  if (m.startsWith('claude-haiku')) return 'haiku';
  if (m.startsWith('claude-sonnet')) return 'sonnet';
  if (m.startsWith('claude-opus')) return 'opus';
  return requestModel;
}

/**
 * Environment for the child `claude` process: the developer's own login must win, so an empty
 * `ANTHROPIC_API_KEY` from `.env` (dotenv exports it as "") is dropped, as is the marker of the
 * Claude Code session the API may have been started from.
 */
export function childEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'])
    if (env[key] !== undefined && env[key].trim() === '') delete env[key];
  delete env.CLAUDECODE;
  return env;
}

/** One line for the log and the error: what the CLI said, plus the usual remedy. */
export function describeFailure(
  code: number | null,
  parsed: CliResult | null,
  stderr: string,
): string {
  const said = (parsed?.result ?? stderr.trim().split('\n')[0] ?? '').slice(0, 300);
  const base = said || `exit ${code}`;
  if (/authentication|not logged in|login/i.test(base))
    return `${base} — run \`claude auth status\` and \`claude login\` on this machine`;
  if (/unknown option|unrecognized|too many arguments/i.test(base))
    return `${base} — Claude Code ≥ 2.1 is required (--json-schema): run \`claude update\``;
  if (code === -1 || /ENOENT/.test(base))
    return `${base} — \`claude\` is not on PATH of this process; set CLAUDE_CLI_PATH to the binary`;
  return base;
}

/** The CLI prints one JSON object (`--output-format json`); tolerate noise around it. */
export function parseCliOutput(stdout: string): CliResult | null {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed) as CliResult;
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first < 0 || last <= first) return null;
    try {
      return JSON.parse(trimmed.slice(first, last + 1)) as CliResult;
    } catch {
      return null;
    }
  }
}

/** First JSON object inside a text answer, or null. */
export function extractJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first < 0 || last <= first) return null;
    try {
      return JSON.parse(t.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}

/** The conversation as plain text — the CLI takes one prompt, not a message array. */
export function renderTranscript(messages: Anthropic.MessageParam[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const who = m.role === 'user' ? 'Студент' : 'Ассистент';
    if (typeof m.content === 'string') {
      lines.push(`${who}: ${m.content}`);
      continue;
    }
    for (const block of m.content) {
      if (block.type === 'text') lines.push(`${who}: ${block.text}`);
      else if (block.type === 'tool_use')
        lines.push(`${who} вызвал инструмент ${block.name}: ${JSON.stringify(block.input)}`);
      else if (block.type === 'tool_result') {
        const body =
          typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
        lines.push(`Результат инструмента: ${body}`);
      }
    }
  }
  return lines.join('\n\n');
}

/** Tool definitions as text plus the envelope rule, for free dialog turns. */
export function toolsAsText(tools: Anthropic.Tool[]): string {
  const list = tools
    .map(
      (t) =>
        `- ${t.name}: ${t.description ?? ''}\n  схема входа: ${JSON.stringify(t.input_schema)}`,
    )
    .join('\n');
  return `Доступные инструменты:\n${list}\n\nОтветь строго JSON: {"text": "...", "tool": null, "input": null} для обычного ответа студенту или {"text": null, "tool": "<имя>", "input": {...}} чтобы вызвать инструмент (один за раз).`;
}

const spawnRunner: CliRunner = (args, stdin, timeoutMs) =>
  new Promise((resolve) => {
    const bin = process.env.CLAUDE_CLI_PATH || 'claude';
    const child = spawn(bin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv(),
      cwd: tmpdir(), // keeps the repo's CLAUDE.md out of the product's prompts
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(stdin);
  });
