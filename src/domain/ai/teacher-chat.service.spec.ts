import type Anthropic from '@anthropic-ai/sdk';
import { AiPurpose } from '../ai-log/ai-usage.entity';
import { Student } from '../students/student.entity';
import { LlmPort, LlmRequest } from './llm.port';
import { PARENT_REPORT_TOOL_NAME } from './parent-report.prompt';
import { StudentFacts } from './student-facts.service';
import { TEACHER_REPLY_TOOL_NAME } from './teacher-chat.prompt';
import { TeacherChatService } from './teacher-chat.service';

const usage = { input_tokens: 10, output_tokens: 5 } as unknown as Anthropic.Usage;

function llm(answer: Record<string, unknown>): LlmPort & { requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  return {
    requests,
    complete: async (req) => {
      requests.push(req);
      const name = req.toolChoice?.type === 'tool' ? req.toolChoice.name : 'x';
      return {
        content: [{ type: 'tool_use', id: 't', name, input: answer }],
        stop_reason: 'tool_use',
        usage,
      } as unknown as Anthropic.Message;
    },
  };
}

const facts = {
  student: { name: 'Акмаль Хадиев' },
  totals: { reports: 3 },
} as unknown as StudentFacts;

describe('TeacherChatService', () => {
  const recorded: Array<{ purpose: AiPurpose; studentId: string | null }> = [];
  const factsService = { collect: jest.fn(async () => facts) };
  const student = Object.assign(new Student(), { id: 's1' });

  function service(port: LlmPort): TeacherChatService {
    return new TeacherChatService(
      port,
      {
        record: async (studentId: string | null, purpose: AiPurpose) => {
          recorded.push({ studentId, purpose });
        },
      } as never,
      factsService as never,
      { aiModelDialog: 'claude-haiku-4-5' } as never,
    );
  }

  it('ask(): facts + history + question go to the model, the forced reply comes back, usage is TEACHER_CHAT', async () => {
    const port = llm({ text: 'Чтение идёт лучше.', draft: false });
    const reply = await service(port).ask(student, 'Что даётся хуже?', [
      { role: 'teacher', text: 'Привет' },
      { role: 'ai', text: 'Здравствуйте' },
    ]);
    expect(reply).toEqual({ text: 'Чтение идёт лучше.', draft: false });
    const req = port.requests[0];
    expect(req.toolChoice).toEqual({ type: 'tool', name: TEACHER_REPLY_TOOL_NAME });
    const payload = JSON.parse(req.messages[0].content as string);
    expect(payload.facts.student.name).toBe('Акмаль Хадиев');
    expect(payload.history).toHaveLength(2);
    expect(payload.question).toBe('Что даётся хуже?');
    expect(factsService.collect).toHaveBeenCalledWith(student, expect.any(Date), { weeks: 4 });
    expect(recorded.at(-1)).toEqual({ studentId: 's1', purpose: AiPurpose.TEACHER_CHAT });
  });

  it('parentReport(): month range facts, PARENT_REPORT usage', async () => {
    const port = llm({ text: 'За сентябрь Акмаль сдал 9 отчётов.' });
    const range = {
      from: new Date('2026-09-01T00:00:00Z'),
      to: new Date('2026-10-01T00:00:00Z'),
      label: 'сентябрь 2026',
    };
    const res = await service(port).parentReport(student, range);
    expect(res.text).toContain('сентябрь');
    expect(port.requests[0].toolChoice).toEqual({ type: 'tool', name: PARENT_REPORT_TOOL_NAME });
    expect(factsService.collect).toHaveBeenLastCalledWith(student, expect.any(Date), range);
    expect(recorded.at(-1)?.purpose).toBe(AiPurpose.PARENT_REPORT);
  });

  it('an empty answer or a model failure is AI_UNAVAILABLE (310)', async () => {
    await expect(service(llm({ text: '', draft: false })).ask(student, 'q')).rejects.toMatchObject({
      code: expect.stringMatching(/310$/),
    });
    const broken: LlmPort = {
      complete: async () => {
        throw new Error('boom');
      },
    };
    await expect(service(broken).ask(student, 'q')).rejects.toMatchObject({
      code: expect.stringMatching(/310$/),
    });
  });
});
