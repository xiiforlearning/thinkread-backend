import type Anthropic from '@anthropic-ai/sdk';
import { globalConfig } from '../../config/global.config';
import { GroupLevel } from '../groups/level';
import { ReportType } from '../reports/report.entity';
import { Student } from '../students/student.entity';
import { LlmPort } from './llm.port';
import { PARSE_TOOL_NAME } from './report-intake.prompt';
import { IntakeResult, ReportIntakeService } from './report-intake.service';

const NOW = new Date('2026-10-01T09:00:00Z');
const TZ = 'Asia/Tashkent';
const usage = { input_tokens: 1, output_tokens: 1 } as unknown as Anthropic.Usage;

function llmReturning(input: Record<string, unknown>): LlmPort {
  return {
    complete: async () =>
      ({
        content: [{ type: 'tool_use', id: 't', name: PARSE_TOOL_NAME, input }],
        stop_reason: 'tool_use',
        usage,
      }) as unknown as Anthropic.Message,
  };
}

function student(level: GroupLevel | null, dialogState = {}): Student {
  return Object.assign(new Student(), { id: 's1', level, dialogState });
}

interface Deps {
  svc: ReportIntakeService;
  reports: Record<string, jest.Mock>;
  words: Record<string, jest.Mock>;
  students: Record<string, jest.Mock>;
  authenticity: Record<string, jest.Mock>;
  enrichment: Record<string, jest.Mock>;
  reportWords: Record<string, jest.Mock>;
  flags: Record<string, jest.Mock>;
}

function make(
  llm: LlmPort,
  opts: {
    limit?: boolean;
    extracted?: { hasList: boolean; items: { word: string; translation: string | null }[] };
    history?: { noNewWords: boolean }[];
  } = {},
): Deps {
  const reports = {
    dailyLimitReached: jest.fn().mockResolvedValue(opts.limit ?? false),
    saveReading: jest.fn().mockResolvedValue({ id: 'r1', method: null }),
    saveListening: jest.fn().mockResolvedValue({ id: 'r2', method: 'PODCAST_NO_TRANSCRIPT' }),
    setWordsAdded: jest.fn(),
    history: jest.fn().mockResolvedValue(opts.history ?? []),
    weekProgress: jest.fn().mockResolvedValue({
      weekStart: '2026-09-28',
      reading: 1,
      listening: 0,
      readingNorm: 3,
      listeningNorm: 3,
    }),
  };
  const words = {
    addWords: jest.fn(async (_s: Student, inputs: { word: string }[]) => ({
      added: inputs.map((w) => ({ word: w.word, lemma: w.word.toLowerCase() })),
      existing: [],
      learned: [],
    })),
    ownedLemmas: jest.fn().mockResolvedValue(new Set(['owl'])),
  };
  const students = {
    patchDialogState: jest.fn(async (s: Student, patch: object) =>
      Object.assign(s, { dialogState: { ...s.dialogState, ...patch } }),
    ),
  };
  const authenticity = { checkLater: jest.fn() };
  const enrichment = { enrichLater: jest.fn() };
  const reportWords = {
    extract: jest.fn().mockResolvedValue({
      ...(opts.extracted ?? { hasList: false, items: [] }),
      dropped: 0,
    }),
  };
  const flags = { raise: jest.fn() };
  const svc = new ReportIntakeService(
    llm,
    { record: jest.fn() } as never,
    reports as never,
    words as never,
    students as never,
    authenticity as never,
    enrichment as never,
    reportWords as never,
    flags as never,
    { aiModelDialog: 'claude-haiku-4-5' } as never,
  );
  return { svc, reports, words, students, authenticity, enrichment, reportWords, flags };
}

const READING = {
  book_title: 'Harry Potter',
  pages: 20,
  summary: 'Harry finds out he is a wizard and leaves the Dursleys.',
};

function draftId(res: IntakeResult): string {
  if (res.status === 'SAVED') throw new Error('saved too early');
  return res.draftId;
}

describe('ReportIntakeService', () => {
  it('parses a complete reading report and stops at the word confirmation — nothing is saved yet', async () => {
    const d = make(llmReturning(READING), {
      extracted: {
        hasList: true,
        items: [
          { word: 'wand', translation: 'палочка' },
          { word: 'owl', translation: null },
        ],
      },
    });
    const s = student(GroupLevel.INTERMEDIATE);

    const res = await d.svc.submit(s, ReportType.READING, 'прочитал 20 страниц ГП...', NOW, TZ);

    expect(res.status).toBe('CONFIRM_WORDS');
    if (res.status !== 'CONFIRM_WORDS') return;
    expect(res.hasList).toBe(true);
    expect(res.words).toEqual([
      { word: 'wand', translation: 'палочка', duplicate: false },
      { word: 'owl', translation: null, duplicate: true },
    ]);
    expect(res.minWords).toBe(globalConfig.norms.minWordsPerReport);
    expect(d.reportWords.extract).toHaveBeenCalledWith(s, 'прочитал 20 страниц ГП...');
    expect(d.reports.saveReading).not.toHaveBeenCalled();
    expect(d.authenticity.checkLater).not.toHaveBeenCalled();
    expect(s.dialogState.reportDraft).toMatchObject({
      id: res.draftId,
      stage: 'CONFIRM_WORDS',
      type: 'READING',
      parsed: { kind: 'READING', book_title: 'Harry Potter' },
    });
    expect(d.svc.current(s, NOW)).toMatchObject({ status: 'CONFIRM_WORDS', draftId: res.draftId });
  });

  it('confirming saves the report with the words as left on the screen and starts the checks', async () => {
    const d = make(llmReturning(READING), {
      extracted: { hasList: true, items: [{ word: 'wand', translation: 'палочка' }] },
    });
    const s = student(GroupLevel.INTERMEDIATE);
    const id = draftId(await d.svc.submit(s, ReportType.READING, 'прочитал...', NOW, TZ));

    const res = await d.svc.confirm(
      s,
      id,
      [
        { word: 'wand', translation: 'палочка' },
        { word: ' Muggle ', translation: null },
        { word: 'wand', translation: 'дубль' },
        { word: 'сова', translation: null },
      ],
      NOW,
      TZ,
    );

    expect(res.status).toBe('SAVED');
    expect(d.reports.saveReading).toHaveBeenCalledWith(
      s,
      {
        bookTitle: 'Harry Potter',
        pages: 20,
        summary: READING.summary,
        newWords: ['wand', 'Muggle'],
      },
      expect.objectContaining({ rawText: 'прочитал...', forwarded: false, noNewWords: false }),
    );
    expect(d.words.addWords).toHaveBeenCalledWith(
      s,
      [
        { word: 'wand', translation: 'палочка' },
        { word: 'Muggle', translation: null },
      ],
      { source: 'READING', sourceReportId: 'r1' },
    );
    expect(d.reports.setWordsAdded).toHaveBeenCalledWith('r1', 2);
    expect(d.enrichment.enrichLater).toHaveBeenCalledWith(['wand', 'muggle'], 's1');
    expect(d.authenticity.checkLater).toHaveBeenCalled();
    expect(d.flags.raise).not.toHaveBeenCalled();
    expect(s.dialogState.reportDraft).toBeUndefined();
  });

  it('confirming without a list uses the extracted words minus duplicates', async () => {
    const d = make(llmReturning(READING), {
      extracted: {
        hasList: true,
        items: [
          { word: 'wand', translation: null },
          { word: 'owl', translation: null },
        ],
      },
    });
    const s = student(GroupLevel.INTERMEDIATE);
    const id = draftId(await d.svc.submit(s, ReportType.READING, 'прочитал...', NOW, TZ));
    await d.svc.confirm(s, id, undefined, NOW, TZ);
    expect(d.words.addWords).toHaveBeenCalledWith(
      s,
      [{ word: 'wand', translation: null }],
      expect.anything(),
    );
  });

  it('an empty list is accepted as "без новых слов"; the second in a row raises the quiet flag', async () => {
    const d = make(llmReturning(READING), {
      history: [{ noNewWords: true }, { noNewWords: true }],
    });
    const s = student(GroupLevel.INTERMEDIATE);
    const first = await d.svc.submit(s, ReportType.READING, 'прочитал...', NOW, TZ);
    expect(first).toMatchObject({ status: 'CONFIRM_WORDS', hasList: false, words: [] });

    const res = await d.svc.confirm(s, draftId(first), [], NOW, TZ);

    expect(res.status).toBe('SAVED');
    expect(d.reports.saveReading).toHaveBeenCalledWith(
      s,
      expect.objectContaining({ newWords: [] }),
      expect.objectContaining({ noNewWords: true }),
    );
    expect(d.words.addWords).not.toHaveBeenCalled();
    expect(d.reports.history).toHaveBeenCalledWith('s1', globalConfig.norms.noNewWordsFlagAfter);
    expect(d.flags.raise).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 's1', reportId: 'r1', kind: 'NO_NEW_WORDS' }),
    );
  });

  it('refuses to confirm below the owner minimum of words', async () => {
    const before = globalConfig.norms.minWordsPerReport;
    globalConfig.norms.minWordsPerReport = 2;
    try {
      const d = make(llmReturning(READING));
      const s = student(GroupLevel.INTERMEDIATE);
      const id = draftId(await d.svc.submit(s, ReportType.READING, 'прочитал...', NOW, TZ));
      await expect(
        d.svc.confirm(s, id, [{ word: 'wand', translation: null }], NOW, TZ),
      ).rejects.toMatchObject({ code: '305262' });
      expect(d.reports.saveReading).not.toHaveBeenCalled();
      expect(s.dialogState.reportDraft).toBeDefined();
    } finally {
      globalConfig.norms.minWordsPerReport = before;
    }
  });

  it('"back to the report" drops the draft; a new submission replaces an old one', async () => {
    const d = make(llmReturning(READING));
    const s = student(GroupLevel.INTERMEDIATE);
    const first = draftId(await d.svc.submit(s, ReportType.READING, 'раз', NOW, TZ));
    const second = draftId(await d.svc.submit(s, ReportType.READING, 'два', NOW, TZ));
    expect(second).not.toBe(first);
    await expect(d.svc.confirm(s, first, [], NOW, TZ)).rejects.toMatchObject({ code: '305002' });

    await d.svc.discard(s, second);
    expect(s.dialogState.reportDraft).toBeUndefined();
    expect(d.svc.current(s, NOW)).toBeNull();
    expect(d.reports.saveReading).not.toHaveBeenCalled();
  });

  it('asks one clarification when the method needs a retelling, keeping a draft; the answer leads to the confirmation', async () => {
    const first = make(
      llmReturning({
        source_title: 'Huberman Lab',
        episode: null,
        first_pass_pct: 80,
        second_pass_pct: null,
        listen_count: 1,
        retelling: null,
        unclear_parts: [],
      }),
    );
    const s = student(GroupLevel.ADVANCED);

    const res = await first.svc.submit(
      s,
      ReportType.LISTENING,
      'слушал Huberman про сон, понял 80%',
      NOW,
      TZ,
    );

    expect(res.status).toBe('CLARIFY');
    if (res.status !== 'CLARIFY') return;
    expect(res.missingFields).toEqual(['retelling']);
    expect(res.question).toContain('retelling');
    expect(s.dialogState.reportDraft).toMatchObject({
      id: res.draftId,
      type: 'LISTENING',
      stage: 'CLARIFY',
      missingFields: ['retelling'],
    });
    expect(first.svc.current(s, NOW)).toMatchObject({ status: 'CLARIFY', draftId: res.draftId });
    expect(first.reportWords.extract).not.toHaveBeenCalled();

    const second = make(
      llmReturning({
        source_title: 'Huberman Lab',
        episode: null,
        first_pass_pct: 80,
        second_pass_pct: null,
        listen_count: 1,
        retelling:
          'The host explains how morning light sets the body clock and suggests a walk after waking.',
        unclear_parts: [],
      }),
    );
    const toConfirm = await second.svc.clarify(s, res.draftId, 'The host explains…', NOW, TZ);
    expect(toConfirm.status).toBe('CONFIRM_WORDS');
    expect(second.reports.saveListening).not.toHaveBeenCalled();

    const done = await second.svc.confirm(s, draftId(toConfirm), [], NOW, TZ);
    expect(done.status).toBe('SAVED');
    expect(second.reports.saveListening).toHaveBeenCalledWith(
      s,
      expect.objectContaining({ sourceTitle: 'Huberman Lab', newWords: [] }),
      expect.objectContaining({ noNewWords: true }),
    );
    expect(s.dialogState.reportDraft).toBeUndefined();
  });

  it('asks to shorten a report whose prose exceeds the owner limit; the word list is not counted', async () => {
    const before = globalConfig.norms.maxReportChars;
    globalConfig.norms.maxReportChars = 300;
    try {
      const llm: LlmPort = { complete: jest.fn() };
      const d = make(llm);
      const prose = 'Harry finds out he is a wizard and leaves the Dursleys for Hogwarts. '.repeat(
        6,
      );
      await expect(
        d.svc.submit(student(null), ReportType.READING, prose, NOW, TZ),
      ).rejects.toMatchObject({ code: '305263' });
      expect(llm.complete).not.toHaveBeenCalled();

      const ok = make(llmReturning(READING));
      const list =
        'New words:\n' + Array.from({ length: 40 }, (_, i) => `word${i} — слово`).join('\n');
      const res = await ok.svc.submit(
        student(null),
        ReportType.READING,
        `${prose.slice(0, 200)}\n${list}`,
        NOW,
        TZ,
      );
      expect(res.status).toBe('CONFIRM_WORDS');
    } finally {
      globalConfig.norms.maxReportChars = before;
    }
  });

  it('refuses a second report of the type on the same day before calling the model', async () => {
    const llm: LlmPort = { complete: jest.fn() };
    const d = make(llm, { limit: true });
    await expect(
      d.svc.submit(student(null), ReportType.READING, 'ещё один', NOW, TZ),
    ).rejects.toMatchObject({ code: '305260' });
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('rejects an unknown or foreign draft id', async () => {
    const d = make(llmReturning({}));
    const foreign = '11111111-1111-4111-8111-111111111111';
    await expect(d.svc.clarify(student(null), foreign, 'x', NOW, TZ)).rejects.toMatchObject({
      code: '305002',
    });
    await expect(d.svc.confirm(student(null), foreign, [], NOW, TZ)).rejects.toMatchObject({
      code: '305002',
    });
  });
});
