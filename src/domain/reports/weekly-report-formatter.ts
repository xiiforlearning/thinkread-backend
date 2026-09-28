import { globalConfig } from '../../config/global.config';
import { reportMessages } from './messages';
import { escapeHtml, formatDateRu, renderNameLink, ReportStudentIdentity } from './report-formatter';

export interface WeeklyDay {
  date: string; // YYYY-MM-DD
  didListening: boolean;
  didReading: boolean;
  active: boolean;
}

export interface WeeklyStudentRow extends ReportStudentIdentity {
  detailQuery: string; // short id used by /student
  hasBook: boolean;
  perDay: WeeklyDay[];
  weekWords: number;
  weekReviews: number;
  missedStreak: number;
  aiFlag: boolean;
}

export interface WeeklyReportGroup {
  chatId: number;
  title: string;
  dates: string[];
  students: WeeklyStudentRow[];
}

export interface WeeklyReportData {
  monday: string;
  friday: string;
  groups: WeeklyReportGroup[];
}

const DOW2: Record<number, string> = {
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
  0: 'Вс',
};

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return DOW2[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? '??';
}

/** Aligned monospace table: day header + reading row + listening row. */
function renderTable(row: WeeklyStudentRow): string {
  const label = (t: string): string => t.padEnd(6);
  const header = label('') + row.perDay.map((d) => ` ${dayLabel(d.date)}`).join('');
  const reading = label('Чтение') + row.perDay.map((d) => `  ${d.didReading ? '+' : '·'}`).join('');
  const listening = label('Аудир.') + row.perDay.map((d) => `  ${d.didListening ? '+' : '·'}`).join('');
  return ['<pre>', header, reading, listening, '</pre>'].join('\n');
}

function renderStudent(row: WeeklyStudentRow): string[] {
  const n = row.perDay.length;
  const readingCount = row.perDay.filter((d) => d.didReading).length;
  const listeningCount = row.perDay.filter((d) => d.didListening).length;
  const name = `👤 ${renderNameLink(row)} · /student ${escapeHtml(row.detailQuery)}`;

  // Nothing done all week → a single compact line.
  if (readingCount === 0 && listeningCount === 0) {
    const line =
      row.missedStreak > 0
        ? reportMessages.weeklyStatusInactive(row.missedStreak)
        : reportMessages.weeklyStatusIdle;
    return [name, line];
  }

  const stats =
    `📊 Слов: ${row.weekWords} · Повторов: ${row.weekReviews} · 📖 ${readingCount}/${n} · 🎧 ${listeningCount}/${n}` +
    (row.aiFlag ? ` · ${reportMessages.weeklyAiFlag}` : '');
  return [name, stats, renderTable(row)];
}

function renderGroup(group: WeeklyReportGroup): string {
  const parts = [reportMessages.groupHeader(escapeHtml(group.title))];
  if (group.students.length === 0) {
    parts.push(reportMessages.weeklyGroupEmpty);
    return parts.join('\n');
  }
  for (const s of group.students) {
    parts.push('', ...renderStudent(s));
  }
  return parts.join('\n');
}

/**
 * Render the weekly report as HTML chunks, each under `maxMessageLength`.
 * Whole group blocks are packed together and flushed on overflow.
 */
export function formatWeeklyReport(data: WeeklyReportData): string[] {
  const head = [
    reportMessages.weeklyHeader(`${formatDateRu(data.monday)} – ${formatDateRu(data.friday)}`),
    reportMessages.weeklyLegendLine,
  ].join('\n');

  if (data.groups.length === 0) {
    return [`${head}\n\n${reportMessages.weeklyNoGroups}`];
  }

  const max = globalConfig.reports.maxMessageLength;
  const chunks: string[] = [];
  let current = head;
  for (const group of data.groups) {
    const block = renderGroup(group);
    if (current.length + 2 + block.length > max) {
      chunks.push(current);
      current = block;
    } else {
      current += `\n\n${block}`;
    }
  }
  chunks.push(current);
  return chunks;
}
