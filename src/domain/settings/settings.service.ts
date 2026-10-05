import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { globalConfig } from '../../config/global.config';
import { Setting } from './setting.entity';

type Rule =
  | { kind: 'int'; min: number; max: number }
  | { kind: 'number'; min: number; max: number }
  | { kind: 'time' };

/**
 * What the owner may change from the dashboard: a dotted path into
 * `globalConfig` and the range it must stay in. Everything else is code.
 */
export const EDITABLE_SETTINGS: Record<string, Rule> = {
  'norms.readingPerWeek': { kind: 'int', min: 0, max: 14 },
  'norms.listeningPerWeek': { kind: 'int', min: 0, max: 14 },
  'norms.cardsPerDay': { kind: 'int', min: 0, max: 50 },
  'cards.correctToAdvance': { kind: 'int', min: 1, max: 5 },
  'cards.stage3ToLearned': { kind: 'int', min: 0, max: 5 },
  'reminders.cardsTime': { kind: 'time' },
  'reminders.reportsTime': { kind: 'time' },
  'reminders.tiredDays': { kind: 'int', min: 1, max: 14 },
  'health.yellowInactiveDays': { kind: 'int', min: 1, max: 30 },
  'health.redInactiveDays': { kind: 'int', min: 1, max: 60 },
  'ai.spotCheckProbability': { kind: 'number', min: 0, max: 1 },
  'ai.dailyTokenLimitPerStudent': { kind: 'int', min: 1_000, max: 5_000_000 },
};

export interface SettingView {
  key: string;
  value: unknown;
  default: unknown;
  overridden: boolean;
  updatedAt: string | null;
}

/** Snapshot of the code defaults, taken once before any override is applied. */
const DEFAULTS: Record<string, unknown> = Object.fromEntries(
  Object.keys(EDITABLE_SETTINGS).map((key) => [key, readPath(globalConfig, key)]),
);

function readPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part];
    return undefined;
  }, obj);
}

function writePath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor: Record<string, unknown> = obj;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!next || typeof next !== 'object') return;
    cursor = next as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

function invalid(key: string, value: unknown): AppError {
  return new AppError({
    level: ErrorLevel.LOW_VALIDATION,
    service: ServiceCode.API,
    error: ErrorCode.VALIDATION,
    message: `setting ${key}: invalid value`,
    meta: { key, value },
  });
}

/** Throws unless `value` fits the rule of `key`; returns the normalized value. */
export function validateSetting(key: string, value: unknown): unknown {
  const rule = EDITABLE_SETTINGS[key];
  if (!rule) throw invalid(key, value);
  if (rule.kind === 'time') {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
      throw invalid(key, value);
    return value;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(key, value);
  if (rule.kind === 'int' && !Number.isInteger(value)) throw invalid(key, value);
  if (value < rule.min || value > rule.max) throw invalid(key, value);
  return value;
}

/**
 * Owner-editable overrides of `globalConfig`, stored in `settings` and applied
 * in place at boot and on every change — the rest of the code keeps reading
 * `globalConfig` and sees the override immediately, in every group.
 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(Setting)
    private readonly repo: Repository<Setting>,
  ) {}

  async onModuleInit(): Promise<void> {
    const rows = await this.repo.find();
    let applied = 0;
    for (const row of rows) {
      if (!(row.key in EDITABLE_SETTINGS)) continue;
      try {
        this.apply(row.key, validateSetting(row.key, row.value));
        applied += 1;
      } catch {
        this.logger.warn(`ignoring invalid stored setting ${row.key}`);
      }
    }
    if (applied > 0) this.logger.log(`applied ${applied} setting override(s)`);
  }

  async all(): Promise<SettingView[]> {
    const rows = await this.repo.find();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return Object.keys(EDITABLE_SETTINGS).map((key) => {
      const row = byKey.get(key);
      return {
        key,
        value: readPath(globalConfig, key),
        default: DEFAULTS[key],
        overridden: row !== undefined,
        updatedAt: row?.updatedAt?.toISOString() ?? null,
      };
    });
  }

  /** Validate every key first, then store and apply — all or nothing. */
  async update(patch: Record<string, unknown>): Promise<SettingView[]> {
    const entries = Object.entries(patch).map(
      ([key, value]) => [key, validateSetting(key, value)] as const,
    );
    for (const [key, value] of entries) {
      await this.repo.save(this.repo.create({ key, value }));
      this.apply(key, value);
    }
    return this.all();
  }

  /** Back to the code default. */
  async reset(key: string): Promise<SettingView[]> {
    if (!(key in EDITABLE_SETTINGS)) throw invalid(key, undefined);
    await this.repo.delete({ key });
    this.apply(key, DEFAULTS[key]);
    return this.all();
  }

  private apply(key: string, value: unknown): void {
    writePath(globalConfig as unknown as Record<string, unknown>, key, value);
  }
}
