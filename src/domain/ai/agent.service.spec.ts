import type Anthropic from '@anthropic-ai/sdk';
import { AppError } from '../../common/errors';
import { globalConfig } from '../../config/global.config';
import { AiMessageRole } from '../ai-log/ai-message.entity';
import { GroupLevel } from '../groups/level';
import { Student } from '../students/student.entity';
import { StudentStatus } from '../students/student.enums';
import { AgentService } from './agent.service';
import { aiMessages } from './messages';
import { LlmPort, LlmRequest } from './llm.port';
import { AgentTool, ToolContext, ToolResult } from './tool';

const NOW = new Date('2026-10-01T09:00:00Z');

function student(): Student {
  return Object.assign(new Student(), {
    id: 's1',
    telegramUserId: 100,
    firstName: 'Акмаль',
    lastName: 'Хадиев',
    displayName: null,
    username: null,
    status: StudentStatus.ACTIVE,
    level: GroupLevel.INTERMEDIATE,
    dialogState: {},
  });
}

const usage = {
  input_tokens: 100,
  output_tokens: 20,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 500,
} as unknown as Anthropic.Usage;

function textResponse(text: string): Anthropic.Message {
  return {
    id: 'm',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage,
  } as unknown as Anthropic.Message;
}

function toolResponse(name: string, input: Record<string, unknown>): Anthropic.Message {
  return {
    ...textResponse(''),
    content: [{ type: 'tool_use', id: `tu_${name}`, name, input }],
    stop_reason: 'tool_use',
  } as unknown as Anthropic.Message;
}

class ScriptedLlm implements LlmPort {
  requests: LlmRequest[] = [];
  constructor(private readonly responses: Anthropic.Message[]) {}
  async complete(request: LlmRequest): Promise<Anthropic.Message> {
    this.requests.push(request);
    const next = this.responses.shift();
    if (!next) throw new Error('no scripted response left');
    return next;
  }
}

class EchoTool implements AgentTool<{ value: string }> {
  name = 'echo';
  description = 'Echo.';
  inputSchema = {
    type: 'object' as const,
    properties: { value: { type: 'string' } },
    required: ['value'],
    additionalProperties: false,
  };
  calls: Array<{ value: string; ctx: ToolContext }> = [];
  async handle(input: { value: string }, ctx: ToolContext): Promise<ToolResult> {
    this.calls.push({ value: input.value, ctx });
    return { data: { echoed: input.value }, keyboard: [[{ text: 'Ок', callbackData: 'ok' }]] };
  }
}

class FailingTool implements AgentTool {
  name = 'fail';
  description = 'Always fails.';
  inputSchema = {
    type: 'object' as const,
    properties: {},
    required: [],
    additionalProperties: false,
  };
  async handle(): Promise<ToolResult> {
    throw new Error('db down');
  }
}

function make(
  llm: LlmPort,
  tools: AgentTool[],
  spent = 0,
): {
  agent: AgentService;
  history: { append: jest.Mock; recent: jest.Mock };
  usageSvc: { record: jest.Mock; tokensSince: jest.Mock };
} {
  const history = {
    append: jest.fn().mockResolvedValue(undefined),
    recent: jest.fn().mockResolvedValue([]),
  };
  const usageSvc = {
    record: jest.fn().mockResolvedValue(undefined),
    tokensSince: jest.fn().mockResolvedValue(spent),
  };
  const reminders = { pendingToday: jest.fn().mockResolvedValue(['CARDS']) };
  const config = { timezone: 'Asia/Tashkent', aiModelDialog: 'claude-haiku-4-5' };
  const agent = new AgentService(
    llm,
    tools,
    history as never,
    usageSvc as never,
    reminders as never,
    config as never,
  );
  return { agent, history, usageSvc };
}

describe('AgentService', () => {
  it('sends a cached system prompt and tools, puts state before the user text, stores both turns', async () => {
    const llm = new ScriptedLlm([textResponse('Привет!')]);
    const { agent, history, usageSvc } = make(llm, [new EchoTool()]);

    const reply = await agent.handle(student(), 'привет', NOW);

    expect(reply).toEqual({ text: 'Привет!', keyboard: undefined });
    const req = llm.requests[0];
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(req.tools.map((t) => t.name)).toEqual(['echo']);
    expect(req.tools[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(req.tools[0].strict).toBe(true);
    const content = req.messages[0].content as Anthropic.TextBlockParam[];
    expect(content[0].text).toContain('Акмаль Хадиев');
    expect(content[0].text).toContain('2026-10-01');
    expect(content[0].text).toContain('CARDS');
    expect(content[1].text).toBe('привет');
    expect(history.append).toHaveBeenCalledWith('s1', AiMessageRole.USER, 'привет');
    expect(history.append).toHaveBeenCalledWith('s1', AiMessageRole.ASSISTANT, 'Привет!');
    expect(usageSvc.record).toHaveBeenCalledWith('s1', 'DIALOG', 'claude-haiku-4-5', usage);
  });

  it('runs a tool, feeds the result back and returns the final text with the keyboard', async () => {
    const llm = new ScriptedLlm([toolResponse('echo', { value: 'x' }), textResponse('Готово')]);
    const echo = new EchoTool();
    const { agent } = make(llm, [echo]);

    const reply = await agent.handle(student(), 'сделай', NOW);

    expect(reply.text).toBe('Готово');
    expect(reply.keyboard).toEqual([[{ text: 'Ок', callbackData: 'ok' }]]);
    expect(echo.calls[0].value).toBe('x');
    expect(echo.calls[0].ctx.student.id).toBe('s1');
    const second = llm.requests[1].messages;
    expect(second[1].role).toBe('assistant');
    const results = second[2].content as Anthropic.ToolResultBlockParam[];
    expect(results[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'tu_echo',
      content: '{"echoed":"x"}',
    });
  });

  it('reports a failing tool to the model as an error result instead of crashing', async () => {
    const llm = new ScriptedLlm([toolResponse('fail', {}), textResponse('Не вышло')]);
    const { agent } = make(llm, [new FailingTool()]);

    const reply = await agent.handle(student(), 'x', NOW);

    expect(reply.text).toBe('Не вышло');
    const results = llm.requests[1].messages[2].content as Anthropic.ToolResultBlockParam[];
    expect(results[0]).toMatchObject({ is_error: true, content: 'Error: db down' });
  });

  it('stops after the tool-iteration limit', async () => {
    const loops = Array.from({ length: globalConfig.ai.maxToolIterations + 1 }, () =>
      toolResponse('echo', { value: 'again' }),
    );
    const { agent } = make(new ScriptedLlm(loops), [new EchoTool()]);

    await expect(agent.handle(student(), 'x', NOW)).rejects.toMatchObject({ code: '409313' });
  });

  it('refuses without calling the model when the daily token budget is spent', async () => {
    const llm = new ScriptedLlm([]);
    const { agent } = make(llm, [], globalConfig.ai.dailyTokenLimitPerStudent);

    const reply = await agent.handle(student(), 'x', NOW);

    expect(reply.text).toBe(aiMessages.budgetExceeded);
    expect(llm.requests).toHaveLength(0);
  });

  it('propagates LLM errors as AppError for the bot to handle', async () => {
    const llm: LlmPort = {
      complete: async () => {
        throw new AppError({ level: 6, service: '09', error: '310' });
      },
    };
    const { agent } = make(llm, []);
    await expect(agent.handle(student(), 'x', NOW)).rejects.toMatchObject({ code: '609310' });
  });
});
