/**
 * Real first and last name, asked at registration instead of the Telegram
 * nickname. Loose on purpose: Latin and Cyrillic letters, hyphens and
 * apostrophes, at least two words, no digits or symbols like "9_9".
 */
export interface ParsedName {
  firstName: string;
  lastName: string;
}

const WORD = /^[\p{L}][\p{L}'’-]*$/u;

export function parseFullName(raw: string): ParsedName | null {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return null;
  if (!words.every((w) => WORD.test(w) && w.length >= 2 && w.length <= 30)) return null;
  const capitalize = (w: string): string => w[0].toLocaleUpperCase() + w.slice(1);
  const [first, ...rest] = words.map(capitalize);
  return { firstName: first, lastName: rest.join(' ') };
}

export function displayNameOf(s: {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  telegramUserId: number;
}): string {
  if (s.displayName) return s.displayName;
  const full = [s.firstName, s.lastName].filter(Boolean).join(' ');
  if (full) return full;
  return s.username ? `@${s.username}` : `id ${s.telegramUserId}`;
}
