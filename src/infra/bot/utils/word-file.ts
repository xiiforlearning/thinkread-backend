import * as XLSX from 'xlsx';
import { parseWordList, ParsedWordLine } from '../../../domain/words/normalize';

export const WORD_FILE_EXTENSIONS = ['.txt', '.csv', '.xlsx'] as const;
export const MAX_WORD_FILE_BYTES = 2 * 1024 * 1024;

export function isWordFile(fileName: string | undefined): boolean {
  const name = (fileName ?? '').toLowerCase();
  return WORD_FILE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Turn an uploaded list into word lines. Spreadsheets: first column is the
 * word, second (if any) the translation, every sheet; text and CSV go
 * through the same free-form parser as a chat message.
 */
export function parseWordFile(fileName: string, data: Buffer): ParsedWordLine[] {
  const name = fileName.toLowerCase();
  if (name.endsWith('.xlsx')) {
    const book = XLSX.read(data, { type: 'buffer' });
    const lines: string[] = [];
    for (const sheetName of book.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], {
        header: 1,
        blankrows: false,
      });
      for (const row of rows) {
        const [word, translation] = row.map((c) =>
          c === undefined || c === null ? '' : String(c),
        );
        if (!word) continue;
        lines.push(translation ? `${word}\t${translation}` : word);
      }
    }
    return parseWordList(lines.join('\n'));
  }
  const text = data.toString('utf8').replace(/^\uFEFF/, '');
  // CSV: the first cell is the word, the second the translation; other columns are ignored.
  if (name.endsWith('.csv')) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, '')))
      .filter((cells) => cells[0])
      .map(([word, translation]) => (translation ? `${word}\t${translation}` : word));
    return parseWordList(lines.join('\n'));
  }
  return parseWordList(text);
}
