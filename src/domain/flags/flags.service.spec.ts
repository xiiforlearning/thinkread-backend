import { FlagKind, FlagStatus, SpotCheckVerdict } from './flag.enums';
import { FlagsService } from './flags.service';

function make(): {
  svc: FlagsService;
  flags: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  spotChecks: { findOne: jest.Mock; save: jest.Mock };
} {
  const flags = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
  };
  const check = {
    id: 'sc1',
    studentId: 's1',
    reportId: 'r1',
    question: 'Чем закончилось?',
    answer: null,
    verdict: null,
    askedAt: null,
    answeredAt: null,
  };
  const spotChecks = {
    findOne: jest.fn().mockResolvedValue(check),
    save: jest.fn(async (x: unknown) => x),
  };
  return { svc: new FlagsService(flags as never, spotChecks as never), flags, spotChecks };
}

describe('FlagsService', () => {
  it('does not duplicate a NEW flag of the same kind for the same report', async () => {
    const { svc, flags } = make();
    flags.findOne.mockResolvedValueOnce({ id: 'existing', kind: FlagKind.FORWARDED, kinds: [] });
    const res = await svc.raise({
      studentId: 's1',
      reportId: 'r1',
      kind: FlagKind.FORWARDED,
      reason: 'x',
    });
    expect(res).toMatchObject({ id: 'existing' });
    expect(flags.save).not.toHaveBeenCalled();
  });

  it('a second signal on the same report joins the open card instead of opening another', async () => {
    const { svc, flags } = make();
    flags.findOne.mockResolvedValueOnce({
      id: 'card',
      kind: FlagKind.GENERIC_RETELLING,
      kinds: [FlagKind.GENERIC_RETELLING],
      reason: 'Общие слова.',
      details: { reasons: { GENERIC_RETELLING: 'Общие слова.' } },
    });
    const res = await svc.raise({
      studentId: 's1',
      reportId: 'r1',
      kind: FlagKind.REPEATED_RETELLING,
      reason: 'Повторяет отчёт от 1 окт.',
      claims: [{ statement: 'тот же эпизод', quote: 'the cat turned into a woman' }],
      details: { metrics: { words: 120, errorsPer100: 4.2, advanced: 0 } },
    });
    expect(res.kinds).toEqual([FlagKind.GENERIC_RETELLING, FlagKind.REPEATED_RETELLING]);
    expect(res.reason).toBe('Общие слова.\nПовторяет отчёт от 1 окт.');
    expect(res.details).toEqual({
      reasons: {
        GENERIC_RETELLING: 'Общие слова.',
        REPEATED_RETELLING: 'Повторяет отчёт от 1 окт.',
      },
      claims: {
        REPEATED_RETELLING: [{ statement: 'тот же эпизод', quote: 'the cat turned into a woman' }],
      },
      metrics: { words: 120, errorsPer100: 4.2, advanced: 0 },
    });
    expect(flags.save).toHaveBeenCalledTimes(1);
  });

  it('creates a NEW flag otherwise', async () => {
    const { svc, flags } = make();
    await svc.raise({
      studentId: 's1',
      reportId: null,
      kind: FlagKind.NORM_MISSED_WEEK,
      reason: 'x',
    });
    expect(flags.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: FlagStatus.NEW,
        kinds: [FlagKind.NORM_MISSED_WEEK],
        details: { reasons: { NORM_MISSED_WEEK: 'x' } },
      }),
    );
  });

  it('stores a spot-check answer; a non-OK verdict raises SPOT_CHECK_FAILED', async () => {
    const { svc, flags, spotChecks } = make();
    const now = new Date();

    const ok = await svc.answerSpotCheck('sc1', 'it ended well', SpotCheckVerdict.OK, now);
    expect(ok.answeredAt).toBe(now);
    expect(ok.askedAt).toBe(now);
    expect(flags.save).not.toHaveBeenCalled();

    spotChecks.findOne.mockResolvedValueOnce({ ...ok, answeredAt: null, verdict: null });
    await svc.answerSpotCheck('sc1', 'dunno', SpotCheckVerdict.VAGUE, now, 'it ended well');
    expect(flags.save).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: FlagKind.SPOT_CHECK_FAILED,
        reportId: 'r1',
        details: expect.objectContaining({
          spotCheck: {
            question: 'Чем закончилось?',
            answer: 'dunno',
            verdict: SpotCheckVerdict.VAGUE,
            quote: 'it ended well',
          },
        }),
      }),
    );
  });

  it('throws NOT_FOUND for an unknown spot check', async () => {
    const { svc, spotChecks } = make();
    spotChecks.findOne.mockResolvedValueOnce(null);
    await expect(
      svc.answerSpotCheck('nope', null, SpotCheckVerdict.NO_ANSWER, new Date()),
    ).rejects.toMatchObject({
      code: '313002',
    });
  });
});
