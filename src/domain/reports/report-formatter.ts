import { reportMessages } from './messages';

export interface ReportWord {
  word: string;
  translation: string;
}

/** Fields shared by every student section, used to render a clickable profile link. */
export interface ReportStudentIdentity {
  fullName: string;
  username: string | null;
  userId: number;
}

export interface ReportStudentActive extends ReportStudentIdentity {
  kind: 'active';
  bookTitle: string;
  pageFrom: number;
  pageTo: number;
  pagesDelta: number;
  wordsCount: number;
  reviewedCount: number;
  words: ReportWord[];
}

export interface ReportStudentInactive extends ReportStudentIdentity {
  kind: 'inactive';
  streakDays: number;
  reviewedCount: number;
  freshPresentation: boolean;
}

export interface ReportStudentNoBook extends ReportStudentIdentity {
  kind: 'noBook';
}

export type ReportStudent = ReportStudentActive | ReportStudentInactive | ReportStudentNoBook;

export interface ReportGroup {
  chatId: number;
  title: string;
  students: ReportStudent[];
}

export interface ReportData {
  date: string; // YYYY-MM-DD
  groups: ReportGroup[];
}

/** YYYY-MM-DD → DD.MM.YYYY */
export function formatDateRu(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Escape user-provided text for Telegram's HTML parse_mode. Reports are sent
 * with parse_mode:'HTML' so student names can be clickable profile links, which
 * means every interpolated dynamic string (names, book titles, words) must be
 * escaped to avoid breaking the markup.
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Render a student's name as a tappable link to their Telegram profile.
 * Prefers a public @username (https://t.me/...), falling back to an inline
 * mention by user id (tg://user?id=...) when no username is set.
 */
export function renderNameLink(s: ReportStudentIdentity): string {
  const label = escapeHtml(s.fullName);
  if (s.username) return `<a href="https://t.me/${s.username}">${label}</a>`;
  return `<a href="tg://user?id=${s.userId}">${label}</a>`;
}

/**
 * Pure formatter. Produces newline-separated report text. Empty groups are
 * still rendered (with no student lines) so the admin sees which groups exist.
 */
export function formatReport(data: ReportData): string {
  const dateRu = formatDateRu(data.date);
  if (data.groups.length === 0) {
    return [reportMessages.header(dateRu), '', reportMessages.noData(dateRu)].join('\n');
  }

  const lines: string[] = [reportMessages.header(dateRu), ''];

  for (const g of data.groups) {
    lines.push(reportMessages.groupHeader(escapeHtml(g.title)), '');
    for (const s of g.students) {
      lines.push(...renderStudent(s));
    }
    lines.push('');
  }

  // Trim trailing blank line
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  return lines.join('\n');
}

function renderStudent(s: ReportStudent): string[] {
  const name = renderNameLink(s);
  if (s.kind === 'noBook') {
    return [reportMessages.studentNoBook(name), ''];
  }
  if (s.kind === 'inactive') {
    const line = s.freshPresentation
      ? reportMessages.studentInactiveFreshPresentation(name, s.streakDays)
      : reportMessages.studentInactive(name, s.streakDays, s.reviewedCount);
    return [line, ''];
  }
  // active
  const head = reportMessages.studentActive(
    name,
    escapeHtml(s.bookTitle),
    s.pageFrom,
    s.pageTo,
    s.pagesDelta,
    s.wordsCount,
    s.reviewedCount,
  );
  const wordLines = s.words.map((w) => `${escapeHtml(w.word)} — ${escapeHtml(w.translation)}`);
  return [head, ...wordLines, ''];
}
