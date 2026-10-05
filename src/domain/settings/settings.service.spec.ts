import { globalConfig } from '../../config/global.config';
import { SettingsService, validateSetting } from './settings.service';

function make(rows: Array<{ key: string; value: unknown }> = []): {
  svc: SettingsService;
  repo: { save: jest.Mock };
} {
  const stored = new Map(
    rows.map((r) => [r.key, { ...r, updatedAt: new Date('2026-10-01T00:00:00Z') }]),
  );
  const repo = {
    find: jest.fn(async () => [...stored.values()]),
    create: jest.fn((x: { key: string; value: unknown }) => x),
    save: jest.fn(async (x: { key: string; value: unknown }) => {
      stored.set(x.key, { ...x, updatedAt: new Date() });
      return x;
    }),
    delete: jest.fn(async ({ key }: { key: string }) => {
      stored.delete(key);
    }),
  };
  return { svc: new SettingsService(repo as never), repo };
}

describe('validateSetting', () => {
  it('accepts values inside the rule and rejects the rest', () => {
    expect(validateSetting('norms.readingPerWeek', 4)).toBe(4);
    expect(validateSetting('reminders.cardsTime', '09:30')).toBe('09:30');
    expect(validateSetting('ai.spotCheckProbability', 0.5)).toBe(0.5);
    expect(() => validateSetting('norms.readingPerWeek', 2.5)).toThrow();
    expect(() => validateSetting('norms.readingPerWeek', 99)).toThrow();
    expect(() => validateSetting('reminders.cardsTime', '25:00')).toThrow();
    expect(() => validateSetting('nope.key', 1)).toThrow();
    expect(() => validateSetting('norms.readingPerWeek', '3')).toThrow();
  });
});

describe('SettingsService', () => {
  const original = globalConfig.norms.readingPerWeek;
  afterEach(() => {
    globalConfig.norms.readingPerWeek = original;
  });

  it('applies stored overrides into globalConfig at boot and skips invalid ones', async () => {
    const { svc } = make([
      { key: 'norms.readingPerWeek', value: 4 },
      { key: 'norms.listeningPerWeek', value: 'bad' },
    ]);
    await svc.onModuleInit();
    expect(globalConfig.norms.readingPerWeek).toBe(4);
    expect(globalConfig.norms.listeningPerWeek).toBe(3);
  });

  it('update stores, applies and reports the override; reset returns to the default', async () => {
    const { svc, repo } = make();
    const views = await svc.update({ 'norms.readingPerWeek': 5 });
    expect(globalConfig.norms.readingPerWeek).toBe(5);
    const view = views.find((v) => v.key === 'norms.readingPerWeek');
    expect(view).toMatchObject({ value: 5, default: original, overridden: true });
    expect(repo.save).toHaveBeenCalledWith({ key: 'norms.readingPerWeek', value: 5 });

    const after = await svc.reset('norms.readingPerWeek');
    expect(globalConfig.norms.readingPerWeek).toBe(original);
    expect(after.find((v) => v.key === 'norms.readingPerWeek')).toMatchObject({
      overridden: false,
    });
  });

  it('rejects the whole patch when one key is invalid', async () => {
    const { svc, repo } = make();
    await expect(
      svc.update({ 'norms.readingPerWeek': 4, 'norms.cardsPerDay': -1 }),
    ).rejects.toThrow();
    expect(repo.save).not.toHaveBeenCalled();
    expect(globalConfig.norms.readingPerWeek).toBe(original);
  });
});
