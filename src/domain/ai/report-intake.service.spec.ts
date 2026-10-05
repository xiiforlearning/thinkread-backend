import type Anthropic from '@anthropic-ai/sdk';
import { GroupLevel } from '../groups/level';
import { ReportType } from '../reports/report.entity';
import { Student } from '../students/student.entity';
import { LlmPort } from './llm.port';
import { PARSE_TOOL_NAME } from './report-intake.prompt';
import { ReportIntakeService } from './report-intake.service';

const NOW = new Date('2026-10-01T09:00:00Z');
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

function make(
  llm: LlmPort,
  limit = false,
): {
  svc: ReportIntakeService;
  reports: Record<string, jest.Mock>;
  words: Record<string, jest.Mock>;
  students: Record<string, jest.Mock>;
  authenticity: Record<string, jest.Mock>;
  enrichment: Record<string, jest.Mock>;
} {
  const reports = {
    dailyLimitReached: jest.fn().mockResolvedValue(limit),
    saveReading: jest.fn().mockResolvedValue({ id: 'r1', method: null }),
    saveListening: jest.fn().mockResolvedValue({ id: 'r2', method: 'PODCAST_NO_TRANSCRIPT' }),
    setWordsAdded: jest.fn(),
    weekProgress: jest.fn().mockResolvedValue({
      weekStart: '2026-09-28',
      reading: 1,
      listening: 0,
      readingNorm: 3,
      listeningNorm: 3,
    }),
  };
  const words = {
    addWords: jest
      .fn()
      .mockResolvedValue({ added: [{ word: 'wand', lemma: 'wand' }], existing: [], learned: [] }),
  };
  const students = {
    patchDialogState: jest.fn(async (s: Student, patch: object) =>
      Object.assign(s, { dialogState: { ...s.dialogState, ...patch } }),
    ),
  };
  const authenticity = { checkLater: jest.fn() };
  const enrichment = { enrichLater: jest.fn() };
  const svc = new ReportIntakeService(
    llm,
    { record: jest.fn() } as never,
    reports as never,
    words as never,
    students as never,
    authenticity as never,
    enrichment as never,
    { aiModelDialog: 'claude-haiku-4-5' } as never,
  );
  return { svc, reports, words, students, authenticity, enrichment };
}

describe('ReportIntakeService', () => {
  it('saves a complete reading report, adds its words and starts the background checks', async () => {
    const d = make(
      llmReturning({
        book_title: 'Harry Potter',
        pages: 20,
        summary: 'Harry finds out he is a wizard and leaves the Dursleys.',
        new_words: ['wand'],
      }),
    );
    const s = student(GroupLevel.INTERMEDIATE);

    const res = await d.svc.submit(
      s,
      ReportType.READING,
      'прочитал 20 страниц ГП...',
      NOW,
      'Asia/Tashkent',
    );

    expect(res.status).toBe('SAVED');
    expect(d.reports.saveReading).toHaveBeenCalledWith(
      s,
      { bookTitle: 'Harry Potter', pages: 20, summary: expect.any(String), newWords: ['wand'] },
      expect.objectContaining({ forwarded: false }),
    );
    expect(d.words.addWords).toHaveBeenCalledWith(s, [{ word: 'wand', translation: null }], {
      source: 'READING',
      sourceReportId: 'r1',
    });
    expect(d.authenticity.checkLater).toHaveBeenCalled();
    expect(d.enrichment.enrichLater).toHaveBeenCalledWith(['wand'], 's1');
  });

  it('asks one clarification when the method needs a retelling, keeping a draft; the answer completes it', async () => {
    const first = make(
      llmReturning({
        source_title: 'Huberman Lab',
        episode: null,
        first_pass_pct: 80,
        second_pass_pct: null,
        listen_count: 1,
        retelling: null,
        unclear_parts: [],
        new_words: [],
      }),
    );
    const s = student(GroupLevel.ADVANCED);

    const res = await first.svc.submit(
      s,
      ReportType.LISTENING,
      'слушал Huberman про сон, понял 80%',
      NOW,
      'Asia/Tashkent',
    );

    expect(res.status).toBe('CLARIFY');
    if (res.status !== 'CLARIFY') return;
    expect(res.missingFields).toEqual(['retelling']);
    expect(res.question).toContain('пересказ');
    expect(s.dialogState.reportDraft).toMatchObject({
      id: res.draftId,
      type: 'LISTENING',
      missingFields: ['retelling'],
    });
    expect(first.reports.saveListening).not.toHaveBeenCalled();

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
        new_words: [],
      }),
    );
    const done = await second.svc.clarify(
      s,
      res.draftId,
      'The host explains…',
      NOW,
      'Asia/Tashkent',
    );
    expect(done.status).toBe('SAVED');
    expect(second.reports.saveListening).toHaveBeenCalled();
    expect(s.dialogState.reportDraft).toBeUndefined();
  });

  it('refuses a second report of the type on the same day before calling the model', async () => {
    const llm: LlmPort = { complete: jest.fn() };
    const d = make(llm, true);
    await expect(
      d.svc.submit(student(null), ReportType.READING, 'ещё один', NOW, 'Asia/Tashkent'),
    ).rejects.toMatchObject({ code: '305260' });
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('rejects an unknown or foreign draft id', async () => {
    const d = make(llmReturning({}));
    await expect(
      d.svc.clarify(
        student(null),
        '11111111-1111-4111-8111-111111111111',
        'x',
        NOW,
        'Asia/Tashkent',
      ),
    ).rejects.toMatchObject({ code: '305002' });
  });
});
