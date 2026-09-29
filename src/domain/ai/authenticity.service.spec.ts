import type Anthropic from '@anthropic-ai/sdk';
import { GroupLevel, ListeningMethod } from '../groups/level';
import { Report, ReportType } from '../reports/report.entity';
import { Student } from '../students/student.entity';
import { AuthenticityService } from './authenticity.service';
import { AuthenticityVerdict, VERDICT_TOOL_NAME } from './authenticity.prompt';
import { LlmPort, LlmRequest } from './llm.port';

const usage = { input_tokens: 10, output_tokens: 5 } as unknown as Anthropic.Usage;

function verdictLlm(verdict: AuthenticityVerdict): LlmPort & { requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  return {
    requests,
    complete: async (req) => {
      requests.push(req);
      return {
        content: [{ type: 'tool_use', id: 't', name: VERDICT_TOOL_NAME, input: verdict }],
        stop_reason: 'tool_use',
        usage,
      } as unknown as Anthropic.Message;
    },
  };
}

function report(over: Partial<Report> = {}): Report {
  return Object.assign(new Report(), {
    id: 'r1',
    studentId: 's1',
    type: ReportType.LISTENING,
    method: ListeningMethod.PODCAST_NO_TRANSCRIPT,
    rawText: 'text',
    sourceTitle: 'Huberman Lab',
    firstPassPct: 90,
    isForwarded: false,
    unclearParts: [],
    createdAt: new Date('2026-10-01T09:00:00Z'),
    ...over,
  });
}

function student(): Student {
  return Object.assign(new Student(), { id: 's1', level: GroupLevel.ADVANCED, dialogState: {} });
}

function make(
  llm: LlmPort,
  previous: Report[] = [],
  random = 0.99,
): {
  svc: AuthenticityService;
  flags: { raise: jest.Mock; createSpotCheck: jest.Mock };
  students: { patchDialogState: jest.Mock };
  usageSvc: { record: jest.Mock };
  reports: { recent: jest.Mock };
} {
  const reports = { recent: jest.fn().mockResolvedValue(previous) };
  const flags = {
    raise: jest.fn().mockResolvedValue(undefined),
    createSpotCheck: jest.fn().mockResolvedValue({ id: 'sc1' }),
  };
  const students = { patchDialogState: jest.fn().mockResolvedValue(undefined) };
  const usageSvc = { record: jest.fn().mockResolvedValue(undefined) };
  const svc = new AuthenticityService(
    llm,
    usageSvc as never,
    reports as never,
    flags as never,
    students as never,
    { aiModelAuthenticity: 'claude-haiku-4-5' } as never,
  );
  svc.random = () => random;
  return { svc, flags, students, usageSvc, reports };
}

const clean: AuthenticityVerdict = {
  suspicious: false,
  kinds: [],
  reason: '',
  spot_check_question: null,
};

describe('AuthenticityService', () => {
  it('forces the verdict tool, logs usage and raises nothing on a clean report', async () => {
    const llm = verdictLlm(clean);
    const { svc, flags, usageSvc, reports } = make(llm);

    await svc.check(report(), student());

    expect(llm.requests[0].toolChoice).toEqual({ type: 'tool', name: VERDICT_TOOL_NAME });
    expect(llm.requests[0].system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(reports.recent).toHaveBeenCalledWith('s1', ReportType.LISTENING, 5, 'r1');
    expect(usageSvc.record).toHaveBeenCalledWith('s1', 'AUTHENTICITY', 'claude-haiku-4-5', usage);
    expect(flags.raise).not.toHaveBeenCalled();
  });

  it('turns a suspicious verdict into one quiet flag per kind', async () => {
    const { svc, flags } = make(
      verdictLlm({
        suspicious: true,
        kinds: ['TOO_POLISHED', 'GENERIC_RETELLING'] as never,
        reason: 'Слишком гладко.',
        spot_check_question: null,
      }),
    );

    await svc.check(report(), student());

    expect(flags.raise).toHaveBeenCalledTimes(2);
    expect(flags.raise).toHaveBeenCalledWith({
      studentId: 's1',
      reportId: 'r1',
      kind: 'TOO_POLISHED',
      reason: 'Слишком гладко.',
    });
  });

  it('flags forwarded reports and comprehension jumps without asking the model', async () => {
    const previous = [
      report({ id: 'p1', firstPassPct: 40 }),
      report({ id: 'p2', firstPassPct: 50 }),
    ];
    const { svc, flags } = make(verdictLlm(clean), previous);

    await svc.check(report({ isForwarded: true, firstPassPct: 95 }), student());

    const kinds = flags.raise.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).toEqual(['FORWARDED', 'PCT_JUMP']);
  });

  it('plants a spot check for a no-transcript listening report when the dice say so', async () => {
    const { svc, flags, students } = make(
      verdictLlm({ ...clean, spot_check_question: 'Чем закончился выпуск?' }),
      [],
      0.1,
    );
    const s = student();

    await svc.check(report(), s);

    expect(flags.createSpotCheck).toHaveBeenCalledWith('s1', 'r1', 'Чем закончился выпуск?');
    expect(students.patchDialogState).toHaveBeenCalledWith(s, { pendingSpotCheckId: 'sc1' });
  });

  it('never plants a spot check for reading, for a script method, or on top of a pending one', async () => {
    const q = { ...clean, spot_check_question: 'q' };
    const a = make(verdictLlm(q), [], 0.1);
    await a.svc.check(report({ type: ReportType.READING, method: null }), student());
    const b = make(verdictLlm(q), [], 0.1);
    await b.svc.check(report({ method: ListeningMethod.PODCAST_WITH_SCRIPT }), student());
    const c = make(verdictLlm(q), [], 0.1);
    const busy = student();
    busy.dialogState = { pendingSpotCheckId: 'old' };
    await c.svc.check(report(), busy);

    expect(a.flags.createSpotCheck).not.toHaveBeenCalled();
    expect(b.flags.createSpotCheck).not.toHaveBeenCalled();
    expect(c.flags.createSpotCheck).not.toHaveBeenCalled();
  });

  it('checkLater swallows failures so the student reply never waits or breaks', async () => {
    const llm: LlmPort = {
      complete: async () => {
        throw new Error('boom');
      },
    };
    const { svc } = make(llm);
    expect(() => svc.checkLater(report(), student())).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });
});
