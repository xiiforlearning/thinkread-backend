import type { ExerciseType } from '../../common/exercise-type';
import { reportMessages } from './messages';
import { escapeHtml, formatDateRu, renderNameLink, ReportStudentIdentity } from './report-formatter';

export interface DetailDay {
  date: string;
  didReading: boolean;
  didListening: boolean;
  words: number;
  page: number | null;
  reviews: number;
}

export interface DetailWord {
  date: string;
  word: string;
  translation: string;
  exerciseType: ExerciseType;
}

export interface DetailFlash {
  total: number;
  due: number;
  avgEase: number;
  lapses: number;
}

export interface DetailAuth {
  recallCorrect: number;
  recallTotal: number;
  forwardedDays: number;
}

export interface StudentDetailData extends ReportStudentIdentity {
  groupTitle: string;
  bookTitle: string | null;
  currentPage: number | null;
  totalPages: number | null;
  monday: string;
  friday: string;
  days: DetailDay[];
  words: DetailWord[];
  listeningWordCount: number;
  readingWordCount: number;
  flash: DetailFlash;
  auth: DetailAuth;
}

const DOW2: Record<number, string> = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 0: 'Вс' };

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DOW2[dow]}${String(d).padStart(2, '0')}`;
}

/** DD.MM (no year) for compact word-day headers. */
function shortDate(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}.${m}`;
}

function cell(v: string, width: number, align: 'l' | 'r' = 'l'): string {
  const s = v.length > width ? v.slice(0, width) : v;
  return align === 'r' ? s.padStart(width) : s.padEnd(width);
}

function renderDayTable(days: DetailDay[]): string {
  const header = [
    cell('День', 5),
    cell('Чт', 2),
    cell('Ау', 2),
    cell('Слов', 4, 'r'),
    cell('Стр', 4, 'r'),
    cell('Повт', 4, 'r'),
  ].join(' ');
  const rows = days.map((d) =>
    [
      cell(dayLabel(d.date), 5),
      cell(d.didReading ? '+' : '·', 2),
      cell(d.didListening ? '+' : '·', 2),
      cell(String(d.words), 4, 'r'),
      cell(d.page !== null ? String(d.page) : '·', 4, 'r'),
      cell(String(d.reviews), 4, 'r'),
    ].join(' '),
  );
  return ['<pre>', header, ...rows, '</pre>'].join('\n');
}

function renderWords(data: StudentDetailData): string[] {
  const lines: string[] = [reportMessages.detailWordsTitle(data.words.length)];
  if (data.words.length === 0) {
    lines.push(reportMessages.detailWordsEmpty);
    return lines;
  }
  const byDay = new Map<string, DetailWord[]>();
  for (const w of data.words) {
    const arr = byDay.get(w.date);
    if (arr) arr.push(w);
    else byDay.set(w.date, [w]);
  }
  for (const date of [...byDay.keys()].sort()) {
    const items = byDay
      .get(date)!
      .map((w) => `${escapeHtml(w.word)} — ${escapeHtml(w.translation)}`)
      .join('; ');
    lines.push(`${shortDate(date)}: ${items}`);
  }
  lines.push(reportMessages.detailWordsSplit(data.listeningWordCount, data.readingWordCount));
  return lines;
}

function renderAuth(auth: DetailAuth): string[] {
  const lines: string[] = [reportMessages.detailAuthTitle];
  if (auth.recallTotal > 0) {
    const pct = Math.round((auth.recallCorrect / auth.recallTotal) * 100);
    lines.push(reportMessages.detailAuthRecall(auth.recallCorrect, auth.recallTotal, pct));
  } else {
    lines.push(reportMessages.detailAuthRecallInsufficient);
  }
  if (auth.forwardedDays > 0) {
    lines.push(reportMessages.detailAuthForwarded(auth.forwardedDays));
  }
  if (auth.recallTotal === 0 && auth.forwardedDays === 0) {
    lines.push(reportMessages.detailAuthClean);
  }
  return lines;
}

/** Full per-student detail as a single HTML string (caller chunks on newlines). */
export function formatStudentDetail(data: StudentDetailData): string {
  const name = renderNameLink(data);
  const lines: string[] = [
    reportMessages.detailHeader(name, escapeHtml(data.groupTitle)),
    data.bookTitle
      ? reportMessages.detailBook(escapeHtml(data.bookTitle), data.currentPage, data.totalPages)
      : reportMessages.detailNoBook,
    reportMessages.detailPeriod(`${formatDateRu(data.monday)} – ${formatDateRu(data.friday)}`),
    '',
    reportMessages.detailDaysTitle,
    renderDayTable(data.days),
    '',
    ...renderWords(data),
    '',
    reportMessages.detailFlashTitle,
    reportMessages.detailFlashLine(
      data.flash.total,
      data.flash.due,
      data.flash.avgEase,
      data.flash.lapses,
    ),
    '',
    ...renderAuth(data.auth),
  ];
  return lines.join('\n');
}
