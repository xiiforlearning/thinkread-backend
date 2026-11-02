import type Anthropic from '@anthropic-ai/sdk';
import { globalConfig } from '../../config/global.config';
import { ReportMetrics } from '../flags/flag.enums';
import { GroupLevel, ListeningMethod } from '../groups/level';
import { Report, ReportType } from '../reports/report.entity';
import { Student } from '../students/student.entity';
import { AuthenticityService } from './authenticity.service';
import { AuthenticityEvidence, VERDICT_TOOL_NAME } from './authenticity.prompt';
import { LlmPort, LlmRequest } from './llm.port';

const usage = { input_tokens: 10, output_tokens: 5 } as unknown as Anthropic.Usage;

function evidenceLlm(
  evidence: Partial<AuthenticityEvidence>,
): LlmPort & { requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  const input: AuthenticityEvidence = {
    findings: [],
    errors: [],
    advanced: [],
    spot_check_question: null,
    ...evidence,
  };
  return {
    requests,
    complete: async (req) => {
      requests.push(req);
      return {
        content: [{ type: 'tool_use', id: 't', name: VERDICT_TOOL_NAME, input }],
        stop_reason: 'tool_use',
        usage,
      } as unknown as Anthropic.Message;
    },
  };
}

const PROSE =
  'The story begins with the Dursley family. They are normal people and dont like anything strange. They have a son named Dudley, who is very spoiled. Mrs Dursley has a sister named Lily Potter, but they dont talk to each other. One day Mr Dursly seas strange things, like a cat looking at a map, people wearing strange clothes and many owls flying during the day. He also hears people talking about Harry Potter and a dark wizard named Voldmort.';

function report(over: Partial<Report> = {}): Report {
  return Object.assign(new Report(), {
    id: 'r1',
    studentId: 's1',
    type: ReportType.LISTENING,
    method: ListeningMethod.PODCAST_NO_TRANSCRIPT,
    rawText: PROSE,
    sourceTitle: 'Huberman Lab',
    firstPassPct: 90,
    isForwarded: false,
    unclearParts: [],
    aiMetrics: null,
    createdAt: new Date('2026-10-01T09:00:00Z'),
    ...over,
  });
}

function student(level = GroupLevel.INTERMEDIATE): Student {
  return Object.assign(new Student(), { id: 's1', level, dialogState: {} });
}

const history = (metrics: ReportMetrics, n = 3): Report[] =>
  Array.from({ length: n }, (_, i) =>
    report({ id: `p${i + 1}`, rawText: PROSE, aiMetrics: metrics }),
  );

function make(
  llm: LlmPort,
  previous: Report[] = [],
  random = 0.99,
): {
  svc: AuthenticityService;
  flags: { raise: jest.Mock; createSpotCheck: jest.Mock };
  students: { patchDialogState: jest.Mock };
  usageSvc: { record: jest.Mock };
  reports: { recent: jest.Mock; setAiMetrics: jest.Mock };
} {
  const reports = {
    recent: jest.fn().mockResolvedValue(previous),
    setAiMetrics: jest.fn().mockResolvedValue(undefined),
  };
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

const kindsRaised = (flags: { raise: jest.Mock }): string[] =>
  flags.raise.mock.calls.map((c) => (c[0] as { kind: string }).kind);

describe('AuthenticityService', () => {
  it('forces the evidence tool, logs usage, stores the metrics and raises nothing on a clean report', async () => {
    const llm = evidenceLlm({});
    const { svc, flags, usageSvc, reports } = make(llm);

    await svc.check(report(), student());

    expect(llm.requests[0].toolChoice).toEqual({ type: 'tool', name: VERDICT_TOOL_NAME });
    expect(llm.requests[0].system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(reports.recent).toHaveBeenCalledWith('s1', ReportType.LISTENING, 5, 'r1');
    expect(usageSvc.record).toHaveBeenCalledWith('s1', 'AUTHENTICITY', 'claude-haiku-4-5', usage);
    expect(reports.setAiMetrics).toHaveBeenCalledWith('r1', {
      words: 80,
      errorsPer100: 0,
      advanced: 0,
    });
    expect(flags.raise).not.toHaveBeenCalled();
  });

  it('the model sees the student text only — never the AI summary — and only connected previous reports', async () => {
    const llm = evidenceLlm({});
    const previous = [
      report({ id: 'p1' }),
      report({ id: 'p2', rawText: 'New words:\nreliable - надежный\navoid - избегать' }),
    ];
    const { svc } = make(llm, previous);

    await svc.check(report({ summary: 'AI summary in Russian' } as never), student());

    const sent = JSON.parse(llm.requests[0].messages[0].content as string) as Record<
      string,
      unknown
    >;
    expect((sent.previous as unknown[]).length).toBe(1);
    expect(JSON.stringify(sent)).not.toContain('summary');
    expect(JSON.stringify(sent)).not.toContain('AI summary');
  });

  it('keeps a content finding only when its quote is in the student text; unverifiable statements are dropped', async () => {
    const { svc, flags } = make(
      evidenceLlm({
        findings: [
          {
            kind: 'GENERIC_RETELLING' as never,
            statement: 'Пересказ ограничивается общими словами.',
            quote: 'They are normal people and dont like anything strange',
            previous_quote: null,
          },
          {
            kind: 'GENERIC_RETELLING' as never,
            statement: 'Ник Каррауэй не окончил Йель в 1915 году.',
            quote: 'did not graduate from Yale in 1915',
            previous_quote: null,
          },
        ],
      }),
    );

    await svc.check(report(), student());

    expect(kindsRaised(flags)).toEqual(['GENERIC_RETELLING']);
    const raised = flags.raise.mock.calls[0][0] as {
      reason: string;
      claims: Array<{ quote: string }>;
    };
    expect(raised.claims).toHaveLength(1);
    expect(raised.reason).toContain('«They are normal people and dont like anything strange»');
    expect(raised.reason).not.toContain('Йель');
  });

  it('REPEATED_RETELLING needs a matching quote in an earlier report too', async () => {
    const finding = {
      kind: 'REPEATED_RETELLING' as never,
      statement: 'Тот же эпизод, что в прошлом отчёте.',
      quote: 'a cat looking at a map',
      previous_quote: 'a cat looking at a map',
    };
    const withBase = make(evidenceLlm({ findings: [finding] }), [report({ id: 'p1' })]);
    await withBase.svc.check(report(), student());
    const noBase = make(
      evidenceLlm({ findings: [{ ...finding, previous_quote: 'the Nemean lion in the museum' }] }),
      [report({ id: 'p1' })],
    );
    await noBase.svc.check(report(), student());

    expect(kindsRaised(withBase.flags)).toEqual(['REPEATED_RETELLING']);
    expect(kindsRaised(noBase.flags)).toEqual([]);
  });

  it('counts only verified error quotes into errorsPer100 and stores them with the metrics', async () => {
    const { svc, reports } = make(
      evidenceLlm({
        errors: [
          { quote: 'Mr Dursly seas strange things', note: 'sees' },
          { quote: 'they dont talk', note: "don't" },
          { quote: 'they dont talk', note: 'duplicate' },
          { quote: 'he were going to school', note: 'not in the text' },
        ],
        advanced: [{ quote: 'a dark wizard named Voldmort', note: 'x' }],
      }),
    );

    await svc.check(report(), student());

    expect(reports.setAiMetrics).toHaveBeenCalledWith('r1', {
      words: 80,
      errorsPer100: 2.5,
      advanced: 1,
    });
  });

  it('STYLE_MISMATCH and TOO_POLISHED come from the numbers against the student history, never from the model', async () => {
    const advanced = [
      { quote: 'a dark wizard named Voldmort', note: 'x' },
      { quote: 'many owls flying during the day', note: 'y' },
    ];
    const usual: ReportMetrics = { words: 90, errorsPer100: 6.2, advanced: 0 };
    // Clean text (0 errors) after three sloppy reports: both measured signals fire.
    const jump = make(evidenceLlm({ advanced }), history(usual));
    await jump.svc.check(report(), student(GroupLevel.INTERMEDIATE));
    // Same clean text but only two previous reports with metrics: no base, no style flag.
    const thin = make(evidenceLlm({ advanced }), history(usual, 2));
    await thin.svc.check(report(), student(GroupLevel.INTERMEDIATE));
    // A student who always writes clean has no jump and is not "too polished".
    const steady = make(
      evidenceLlm({ advanced }),
      history({ words: 90, errorsPer100: 0.5, advanced: 1 }),
    );
    await steady.svc.check(report(), student(GroupLevel.INTERMEDIATE));
    // Clean text without above-level fragments is just a clean text.
    const plain = make(evidenceLlm({}), history(usual));
    await plain.svc.check(report(), student(GroupLevel.INTERMEDIATE));

    expect(kindsRaised(jump.flags)).toEqual(['STYLE_MISMATCH', 'TOO_POLISHED']);
    const style = jump.flags.raise.mock.calls[0][0] as {
      reason: string;
      details: Record<string, unknown>;
    };
    expect(style.reason).toBe(
      'Ошибок 0 на 100 слов при обычных 6,2 (по 3 отчётам). Новые для студента конструкции: «a dark wizard named Voldmort», «many owls flying during the day».',
    );
    expect(style.details.baseline).toEqual({ reports: 3, errorsPer100: 6.2, advanced: 0 });
    expect(kindsRaised(thin.flags)).toEqual([]);
    expect(kindsRaised(steady.flags)).toEqual([]);
    expect(kindsRaised(plain.flags)).toEqual([]);
  });

  it('short prose is never judged on style', async () => {
    const advanced = [
      { quote: 'strange things', note: 'x' },
      { quote: 'strange clothes', note: 'y' },
    ];
    const { svc, flags } = make(
      evidenceLlm({ advanced }),
      history({ words: 90, errorsPer100: 6.2, advanced: 0 }),
    );
    await svc.check(
      report({ rawText: 'He seas strange things and strange clothes on the street today.' }),
      student(),
    );
    expect(kindsRaised(flags)).toEqual([]);
    expect(globalConfig.ai.style.minProseWords).toBe(60);
  });

  it('flags forwarded reports and comprehension jumps without asking the model', async () => {
    const previous = [
      report({ id: 'p1', firstPassPct: 40 }),
      report({ id: 'p2', firstPassPct: 50 }),
    ];
    const { svc, flags } = make(evidenceLlm({}), previous);

    await svc.check(report({ isForwarded: true, firstPassPct: 95 }), student());

    expect(kindsRaised(flags)).toEqual(['FORWARDED', 'PCT_JUMP']);
  });

  it('the same episode of the same series handed in twice is REPEATED_RETELLING by code (F10)', async () => {
    const previous = [
      report({ id: 'p1', sourceTitle: 'Blue Lock', episode: 'Episode 1', firstPassPct: 70 }),
      report({ id: 'p2', sourceTitle: 'Blue Lock', episode: '2', firstPassPct: 70 }),
    ];
    const { svc, flags } = make(evidenceLlm({}), previous);

    await svc.check(
      report({ sourceTitle: 'blue lock', episode: '1 ep', firstPassPct: 70 }),
      student(),
    );
    expect(kindsRaised(flags)).toEqual(['REPEATED_RETELLING']);
    expect(flags.raise.mock.calls[0][0].reason).toContain('Blue Lock — Episode 1');

    const again = make(evidenceLlm({}), previous);
    await again.svc.check(
      report({ sourceTitle: 'Blue Lock', episode: '3', firstPassPct: 70 }),
      student(),
    );
    expect(kindsRaised(again.flags)).toEqual([]);
  });

  it('plants a spot check for a no-transcript listening report when the dice say so', async () => {
    const { svc, flags, students } = make(
      evidenceLlm({ spot_check_question: 'Чем закончился выпуск?' }),
      [],
      0.1,
    );
    const s = student();

    await svc.check(report(), s);

    expect(flags.createSpotCheck).toHaveBeenCalledWith('s1', 'r1', 'Чем закончился выпуск?');
    expect(students.patchDialogState).toHaveBeenCalledWith(s, { pendingSpotCheckId: 'sc1' });
  });

  it('never plants a spot check for reading, for a script method, or on top of a pending one', async () => {
    const q = { spot_check_question: 'q' };
    const a = make(evidenceLlm(q), [], 0.1);
    await a.svc.check(report({ type: ReportType.READING, method: null }), student());
    const b = make(evidenceLlm(q), [], 0.1);
    await b.svc.check(report({ method: ListeningMethod.PODCAST_WITH_SCRIPT }), student());
    const c = make(evidenceLlm(q), [], 0.1);
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
