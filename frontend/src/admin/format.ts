import type { GroupLevel } from '../api/types';
import { fmtDay, fmtRelative, fmtWeek, plural } from '../lib/dates';
import { LEVEL_LABEL } from '../lib/labels';
import type { AdminReport, FlagKind, FlagStatus, Health, StudentRef } from './api';

export { fmtDay, fmtRelative, fmtWeek, plural };

export const FLAG_TITLE: Record<FlagKind, string> = {
  PCT_JUMP: 'Резкий скачок понимания',
  NORM_MISSED_WEEK: 'Неделя без отчётов',
  TOO_POLISHED: 'Слишком гладкий текст',
  FORWARDED: 'Пересланное сообщение',
  SPOT_CHECK_FAILED: 'Точечная проверка не пройдена',
  REPEATED_RETELLING: 'Пересказ почти не меняется',
  STYLE_MISMATCH: 'Стиль выше обычного уровня',
  GENERIC_RETELLING: 'Пересказ без деталей',
};

export const FLAG_SHORT: Record<FlagKind, string> = {
  PCT_JUMP: 'Скачок %',
  NORM_MISSED_WEEK: 'Без нормы',
  TOO_POLISHED: 'Гладкий текст',
  FORWARDED: 'Переслано',
  SPOT_CHECK_FAILED: 'Проверка',
  REPEATED_RETELLING: 'Повтор',
  STYLE_MISMATCH: 'Стиль',
  GENERIC_RETELLING: 'Общие слова',
};

export const FLAG_STATUS_LABEL: Record<FlagStatus, string> = {
  NEW: 'новый',
  REVIEWED: 'проверено',
  DISMISSED: 'ложная тревога',
};

export const HEALTH_TONE: Record<Health, 'bad' | 'cards' | 'listen'> = {
  bad: 'bad',
  warn: 'cards',
  good: 'listen',
};

export function levelOf(level: GroupLevel | null): string {
  return level ? LEVEL_LABEL[level] : 'уровень не задан';
}

export function groupsOf(s: Pick<StudentRef, 'groups'>): string {
  return s.groups.map((g) => g.title).join(', ') || 'без группы';
}

export function silence(days: number, dmBlocked: boolean): string {
  if (dmBlocked) return 'заблокировал бота';
  if (days === 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return `${days} дн. тишины`;
}

export function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function delta(d: number): { text: string; tone: 'good' | 'bad' | undefined } {
  const pp = Math.round(d * 100);
  if (pp === 0) return { text: 'как на прошлой', tone: undefined };
  return {
    text: `${pp > 0 ? '+' : '−'}${Math.abs(pp)} п.п. к прошлой`,
    tone: pp > 0 ? 'good' : 'bad',
  };
}

/** "Harry Potter · 15 стр. · +3 слова" / "6 Minute English · 70% → 88% · 3 раза · +2 слова" */
export function reportMeta(r: AdminReport): string {
  const parts: string[] = [];
  if (r.sourceTitle) parts.push(r.sourceTitle + (r.episode ? ` · ${r.episode}` : ''));
  if (r.type === 'READING') {
    if (r.pages !== null) parts.push(`${r.pages} стр.`);
  } else {
    if (r.firstPassPct !== null)
      parts.push(
        r.secondPassPct !== null
          ? `${r.firstPassPct}% → ${r.secondPassPct}%`
          : `${r.firstPassPct}%`,
      );
    if (r.listenCount !== null)
      parts.push(`${r.listenCount} ${plural(r.listenCount, 'раз', 'раза', 'раз')}`);
  }
  parts.push(`+${r.wordsAdded.length} ${plural(r.wordsAdded.length, 'слово', 'слова', 'слов')}`);
  return parts.join(' · ');
}

export function reportText(r: AdminReport): string {
  return r.rawText ?? r.summary ?? '—';
}

export function money(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export function tokensShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} тыс.`;
  return String(n);
}

export function num(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
    .format(new Date(y, m - 1, 1))
    .replace(' г.', '');
}
