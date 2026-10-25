import type Anthropic from '@anthropic-ai/sdk';
import { AiPurpose } from '../ai-log/ai-usage.entity';
import { LlmPort, LlmRequest } from './llm.port';
import { SCHOOL_REPLY_TOOL_NAME } from './school-chat.prompt';
import { SchoolChatService } from './school-chat.service';
import { schoolReply } from './simulate';
import { AI_SKILLS } from './skills';

const usage = { input_tokens: 10, output_tokens: 5 } as unknown as Anthropic.Usage;

function llm(answer: Record<string, unknown>): LlmPort & { requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  return {
    requests,
    complete: async (req) => {
      requests.push(req);
      return {
        content: [{ type: 'tool_use', id: 't', name: SCHOOL_REPLY_TOOL_NAME, input: answer }],
        stop_reason: 'tool_use',
        usage,
      } as unknown as Anthropic.Message;
    },
  };
}

describe('SchoolChatService', () => {
  it('sends facts + history + question with the forced tool and logs usage without a student', async () => {
    const recorded: Array<{ studentId: string | null; purpose: AiPurpose }> = [];
    const port = llm({ text: 'Отстают двое.' });
    const service = new SchoolChatService(
      port,
      {
        record: async (studentId: string | null, purpose: AiPurpose) =>
          void recorded.push({ studentId, purpose }),
      } as never,
      { collect: jest.fn(async () => ({ scope: 'school', students: [] })) } as never,
      { aiModelDialog: 'claude-haiku-4-5' } as never,
    );
    const reply = await service.ask({ studentIds: null, groupIds: null }, 'Кто отстаёт?', [
      { role: 'teacher', text: 'Привет' },
    ]);
    expect(reply).toEqual({ text: 'Отстают двое.' });
    const req = port.requests[0];
    expect(req.toolChoice).toEqual({ type: 'tool', name: SCHOOL_REPLY_TOOL_NAME });
    const payload = JSON.parse(req.messages[0].content as string);
    expect(payload.facts.scope).toBe('school');
    expect(payload.history).toHaveLength(1);
    expect(payload.question).toBe('Кто отстаёт?');
    expect(recorded).toEqual([{ studentId: null, purpose: AiPurpose.SCHOOL_CHAT }]);
  });

  it('is an AI skill whose simulator answers laggards, group comparison and totals from the example', () => {
    const skill = AI_SKILLS.find((s) => s.name === 'school_chat');
    expect(skill?.purpose).toBe(AiPurpose.SCHOOL_CHAT);
    const example = JSON.parse(skill?.example ?? '{}');
    const laggards = schoolReply(
      JSON.stringify({ ...example, question: 'Кто отстаёт по чтению?' }),
    );
    expect(String(laggards.text)).toContain('Фирдавс Каримов');
    expect(String(laggards.text)).not.toContain('Акмаль');
    const groups = schoolReply(JSON.stringify({ ...example, question: 'Сравни группы' }));
    expect(String(groups.text)).toContain('Upper 16:00');
    expect(String(groups.text)).toContain('IELTS I');
    const totals = schoolReply(JSON.stringify({ ...example, question: 'Как дела?' }));
    expect(String(totals.text)).toContain('Студентов: 3');
  });
});
