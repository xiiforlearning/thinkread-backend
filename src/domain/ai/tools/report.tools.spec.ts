import { GroupLevel } from '../../groups/level';
import { Student } from '../../students/student.entity';
import { StudentStatus } from '../../students/student.enums';
import { ToolContext } from '../tool';
import {
  GetProgressTool,
  RecordSpotCheckAnswerTool,
  SaveListeningReportTool,
  SaveReadingReportTool,
} from './report.tools';

const NOW = new Date('2026-10-01T09:00:00Z');

function ctx(level: GroupLevel | null, dialogState = {}): ToolContext {
  const student = Object.assign(new Student(), {
    id: 's1',
    status: StudentStatus.ACTIVE,
    level,
    dialogState,
  });
  return {
    student,
    now: NOW,
    timeZone: 'Asia/Tashkent',
    message: { text: 'исходный текст', forwarded: true },
  };
}

const progress = {
  weekStart: '2026-09-28',
  reading: 2,
  listening: 1,
  readingNorm: 3,
  listeningNorm: 3,
};

function deps(limitReached = false): {
  reports: {
    saveReading: jest.Mock;
    saveListening: jest.Mock;
    weekProgress: jest.Mock;
    dailyLimitReached: jest.Mock;
  };
  authenticity: { checkLater: jest.Mock };
} {
  return {
    reports: {
      saveReading: jest.fn().mockResolvedValue({ id: 'r1' }),
      saveListening: jest.fn().mockResolvedValue({ id: 'r2' }),
      weekProgress: jest.fn().mockResolvedValue(progress),
      dailyLimitReached: jest.fn().mockResolvedValue(limitReached),
    },
    authenticity: { checkLater: jest.fn() },
  };
}

describe('save_reading_report', () => {
  it('saves, passes the message as origin, starts the authenticity check and returns progress', async () => {
    const d = deps();
    const tool = new SaveReadingReportTool(d.reports as never, d.authenticity as never);
    const c = ctx(GroupLevel.INTERMEDIATE);

    const res = await tool.handle(
      {
        book_title: 'Harry Potter',
        pages: 20,
        summary: 'Harry learns he is a wizard and Hagrid takes him away.',
        new_words: ['wand', 'owl'],
      },
      c,
    );

    expect(d.reports.saveReading).toHaveBeenCalledWith(
      c.student,
      {
        bookTitle: 'Harry Potter',
        pages: 20,
        summary: expect.any(String),
        newWords: ['wand', 'owl'],
      },
      { now: NOW, timeZone: 'Asia/Tashkent', rawText: 'исходный текст', forwarded: true },
    );
    expect(d.authenticity.checkLater).toHaveBeenCalledWith({ id: 'r1' }, c.student);
    expect(res.data).toMatchObject({
      saved: true,
      weekProgress: { reading: '2/3', listening: '1/3', readingDone: false },
      newWordsNoted: 2,
    });
  });

  it('refuses a second reading report on the same day without saving or asking', async () => {
    const d = deps(true);
    const tool = new SaveReadingReportTool(d.reports as never, d.authenticity as never);

    const res = await tool.handle(
      {
        book_title: 'Harry Potter',
        pages: 10,
        summary: 'Harry gets his letter and meets Hagrid.',
        new_words: [],
      },
      ctx(null),
    );

    expect(res.data).toMatchObject({ saved: false, reason: 'DAILY_LIMIT' });
    expect(d.reports.saveReading).not.toHaveBeenCalled();
    expect(d.authenticity.checkLater).not.toHaveBeenCalled();
  });

  it('asks for a real summary instead of saving a bare title', async () => {
    const d = deps();
    const tool = new SaveReadingReportTool(d.reports as never, d.authenticity as never);

    const res = await tool.handle(
      { book_title: 'Harry Potter', pages: null, summary: 'good', new_words: [] },
      ctx(null),
    );

    expect(res.data).toMatchObject({ saved: false, missing_fields: ['summary'] });
    expect(d.reports.saveReading).not.toHaveBeenCalled();
  });
});

describe('save_listening_report', () => {
  const full = {
    source_title: 'Friends',
    episode: 's01e03',
    first_pass_pct: 70,
    second_pass_pct: null,
    listen_count: 2,
    retelling: 'Ross finds out Carol is pregnant and they argue about the name of the baby.',
    unclear_parts: [],
    new_words: ['pregnant'],
  };

  it('returns missing_fields by the method of the student level (series needs a retelling)', async () => {
    const d = deps();
    const tool = new SaveListeningReportTool(d.reports as never, d.authenticity as never);

    const res = await tool.handle({ ...full, retelling: null }, ctx(GroupLevel.INTERMEDIATE));

    expect(res.data).toMatchObject({
      saved: false,
      method: 'SERIES',
      missing_fields: ['retelling'],
    });
    expect(String(res.data.hint)).toContain('пересказ');
    expect(d.reports.saveListening).not.toHaveBeenCalled();
  });

  it('does not require a retelling for a podcast with a script but needs both passes', async () => {
    const d = deps();
    const tool = new SaveListeningReportTool(d.reports as never, d.authenticity as never);

    const res = await tool.handle(
      { ...full, retelling: null, episode: null },
      ctx(GroupLevel.PRE_INTERMEDIATE),
    );

    expect(res.data).toMatchObject({ saved: false, missing_fields: ['second_pass_pct'] });
  });

  it('refuses a second listening report on the same day before checking fields', async () => {
    const d = deps(true);
    const tool = new SaveListeningReportTool(d.reports as never, d.authenticity as never);
    const res = await tool.handle({ ...full, retelling: null }, ctx(GroupLevel.INTERMEDIATE));
    expect(res.data).toMatchObject({ saved: false, reason: 'DAILY_LIMIT' });
    expect(res.data).not.toHaveProperty('missing_fields');
  });

  it('saves a complete report and runs the authenticity check in the background', async () => {
    const d = deps();
    const tool = new SaveListeningReportTool(d.reports as never, d.authenticity as never);
    const c = ctx(GroupLevel.INTERMEDIATE);

    const res = await tool.handle(full, c);

    expect(d.reports.saveListening).toHaveBeenCalledWith(
      c.student,
      expect.objectContaining({ sourceTitle: 'Friends', episode: 's01e03', listenCount: 2 }),
      expect.objectContaining({ forwarded: true }),
    );
    expect(d.authenticity.checkLater).toHaveBeenCalledWith({ id: 'r2' }, c.student);
    expect(res.data).toMatchObject({ saved: true, reportId: 'r2' });
  });
});

describe('get_progress', () => {
  it('reports the week counts against the norms', async () => {
    const d = deps();
    const res = await new GetProgressTool(d.reports as never).handle({}, ctx(null));
    expect(res.data).toMatchObject({ weekStart: '2026-09-28', reading: '2/3', listening: '1/3' });
  });
});

describe('record_spot_check_answer', () => {
  it('records the verdict for the pending check and clears it', async () => {
    const flags = { answerSpotCheck: jest.fn().mockResolvedValue(undefined) };
    const students = { patchDialogState: jest.fn().mockResolvedValue(undefined) };
    const tool = new RecordSpotCheckAnswerTool(flags as never, students as never);
    const c = ctx(null, { pendingSpotCheckId: 'sc1' });

    const res = await tool.handle({ answer: 'they broke up', verdict: 'OK' as never }, c);

    expect(flags.answerSpotCheck).toHaveBeenCalledWith('sc1', 'they broke up', 'OK', NOW);
    expect(students.patchDialogState).toHaveBeenCalledWith(c.student, {
      pendingSpotCheckId: undefined,
    });
    expect(res.data).toEqual({ recorded: true });
  });

  it('is a no-op without a pending check', async () => {
    const flags = { answerSpotCheck: jest.fn() };
    const tool = new RecordSpotCheckAnswerTool(flags as never, {} as never);
    const res = await tool.handle({ answer: 'x', verdict: 'OK' as never }, ctx(null));
    expect(res.data).toMatchObject({ recorded: false });
    expect(flags.answerSpotCheck).not.toHaveBeenCalled();
  });
});
