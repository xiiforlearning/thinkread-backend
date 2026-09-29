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
    flags.findOne.mockResolvedValueOnce({ id: 'existing' });
    const res = await svc.raise({
      studentId: 's1',
      reportId: 'r1',
      kind: FlagKind.FORWARDED,
      reason: 'x',
    });
    expect(res).toEqual({ id: 'existing' });
    expect(flags.save).not.toHaveBeenCalled();
  });

  it('creates a NEW flag otherwise', async () => {
    const { svc, flags } = make();
    await svc.raise({
      studentId: 's1',
      reportId: null,
      kind: FlagKind.NORM_MISSED_3_WEEKS,
      reason: 'x',
    });
    expect(flags.save).toHaveBeenCalledWith(expect.objectContaining({ status: FlagStatus.NEW }));
  });

  it('stores a spot-check answer; a non-OK verdict raises SPOT_CHECK_FAILED', async () => {
    const { svc, flags, spotChecks } = make();
    const now = new Date();

    const ok = await svc.answerSpotCheck('sc1', 'it ended well', SpotCheckVerdict.OK, now);
    expect(ok.answeredAt).toBe(now);
    expect(ok.askedAt).toBe(now);
    expect(flags.save).not.toHaveBeenCalled();

    spotChecks.findOne.mockResolvedValueOnce({ ...ok, answeredAt: null, verdict: null });
    await svc.answerSpotCheck('sc1', 'dunno', SpotCheckVerdict.VAGUE, now);
    expect(flags.save).toHaveBeenCalledWith(
      expect.objectContaining({ kind: FlagKind.SPOT_CHECK_FAILED, reportId: 'r1' }),
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
