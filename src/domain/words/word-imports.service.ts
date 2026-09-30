import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { globalConfig } from '../../config/global.config';
import { Student } from '../students/student.entity';
import { lemmaOf, ParsedWordLine } from './normalize';
import { WordImport, WordImportItem } from './word-import.entity';
import { ImportStatus, WordSource } from './word.enums';
import { AddWordsResult, WordsService } from './words.service';

export interface ImportPreview {
  importId: string;
  found: number;
  duplicates: number;
  toAdd: number;
  items: WordImportItem[];
}

/**
 * Bulk import in two steps: a preview ("found 40, 3 already there, add 37?")
 * saved as PENDING, then confirm / cancel from an inline button or the Mini
 * App. Previews expire after `words.importPreviewTtlHours`.
 */
@Injectable()
export class WordImportsService {
  constructor(
    @InjectRepository(WordImport)
    private readonly repo: Repository<WordImport>,
    private readonly words: WordsService,
  ) {}

  async createPreview(student: Student, parsed: ParsedWordLine[]): Promise<ImportPreview> {
    const owned = await this.words.ownedLemmas(student.id);
    const items: WordImportItem[] = parsed.map((p) => ({
      word: p.word,
      translation: p.translation,
      duplicate: owned.has(lemmaOf(p.word)),
    }));
    const row = await this.repo.save(
      this.repo.create({
        studentId: student.id,
        groupChatId: null,
        items,
        status: ImportStatus.PENDING,
      }),
    );
    return this.describe(row);
  }

  async find(id: string): Promise<WordImport | null> {
    return this.repo.findOne({ where: { id } });
  }

  describe(row: WordImport): ImportPreview {
    const duplicates = row.items.filter((i) => i.duplicate).length;
    const toAdd = row.items.filter((i) => !i.duplicate && !i.excluded).length;
    return { importId: row.id, found: row.items.length, duplicates, toAdd, items: row.items };
  }

  /** Confirm a pending preview for its owner. Expired previews are marked and refused. */
  async confirm(
    id: string,
    student: Student,
    excludedWords: string[] = [],
  ): Promise<AddWordsResult> {
    const row = await this.getPending(id, student);
    const excluded = new Set(excludedWords.map(lemmaOf));
    const inputs = row.items
      .filter((i) => !i.duplicate && !i.excluded && !excluded.has(lemmaOf(i.word)))
      .map((i) => ({ word: i.word, translation: i.translation }));
    const result = await this.words.addWords(student, inputs, { source: WordSource.IMPORT });
    row.status = ImportStatus.CONFIRMED;
    await this.repo.save(row);
    return result;
  }

  async cancel(id: string, student: Student): Promise<void> {
    const row = await this.getPending(id, student);
    row.status = ImportStatus.CANCELLED;
    await this.repo.save(row);
  }

  private async getPending(id: string, student: Student): Promise<WordImport> {
    const row = await this.find(id);
    if (!row || row.studentId !== student.id) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.WORDS,
        error: ErrorCode.NOT_FOUND,
        meta: { id },
      });
    }
    const ttl = globalConfig.words.importPreviewTtlHours * 3_600_000;
    if (row.status === ImportStatus.PENDING && Date.now() - row.createdAt.getTime() > ttl) {
      row.status = ImportStatus.EXPIRED;
      await this.repo.save(row);
    }
    if (row.status !== ImportStatus.PENDING) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.WORDS,
        error: ErrorCode.IMPORT_EXPIRED,
        meta: { id, status: row.status },
      });
    }
    return row;
  }
}
