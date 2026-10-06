import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { Student } from '../students/student.entity';
import { LexiconService } from './lexicon.service';
import { displayWord, lemmaOf } from './normalize';
import { Word } from './word.entity';
import { CardStage, CefrLevel, WordPriority, WordSource, WordStatus } from './word.enums';

export interface NewWordInput {
  word: string;
  translation?: string | null;
}

export interface AddWordsOptions {
  source: WordSource;
  sourceReportId?: string | null;
  sourceListId?: string | null;
  /** Manually added and teacher-list words default to HIGH. */
  priority?: WordPriority;
}

export interface AddWordsResult {
  added: Word[];
  /** Already in the vocabulary and still LEARNING — untouched. */
  existing: Word[];
  /** Already LEARNED — the caller may offer to return them to review. */
  learned: Word[];
}

export interface SearchOptions {
  query?: string;
  status?: WordStatus;
  cefr?: CefrLevel;
  source?: WordSource;
  priority?: WordPriority;
  limit?: number;
}

export interface VocabularySummary {
  total: number;
  learning: number;
  learned: number;
  priority: number;
  byCefr: Record<string, number>;
  bySource: Record<string, number>;
}

const MANUAL_SOURCES: readonly WordSource[] = [
  WordSource.MANUAL,
  WordSource.IMPORT,
  WordSource.TEACHER,
];

/**
 * A student's personal vocabulary. Uniqueness is (student, lower(word)); the
 * lemma links a word to the shared lexicon for translation, examples and
 * card material. Nothing is ever deleted — LEARNED is the terminal status.
 */
@Injectable()
export class WordsService {
  constructor(
    @InjectRepository(Word)
    private readonly repo: Repository<Word>,
    private readonly lexicon: LexiconService,
  ) {}

  /** Add words, skipping ones the student already has. Returns what happened to each. */
  async addWords(
    student: Student,
    inputs: NewWordInput[],
    opts: AddWordsOptions,
  ): Promise<AddWordsResult> {
    const clean = new Map<string, NewWordInput>();
    for (const input of inputs) {
      const word = displayWord(input.word);
      const lemma = lemmaOf(word);
      if (!lemma || clean.has(lemma)) continue;
      clean.set(lemma, { word, translation: displayWord(input.translation ?? '') || null });
    }
    if (clean.size === 0) return { added: [], existing: [], learned: [] };

    const lemmas = [...clean.keys()];
    const owned = await this.repo
      .createQueryBuilder('w')
      .where('w.student_id = :studentId', { studentId: student.id })
      .andWhere('(w.lemma IN (:...lemmas) OR lower(w.word) IN (:...lemmas))', { lemmas })
      .getMany();
    const ownedByLemma = new Map(owned.map((w) => [w.lemma ?? lemmaOf(w.word), w]));

    const existing: Word[] = [];
    const learned: Word[] = [];
    const toCreate: Word[] = [];
    const known = await this.lexicon.findMany(lemmas);
    const priority =
      opts.priority ??
      (MANUAL_SOURCES.includes(opts.source) ? WordPriority.HIGH : WordPriority.NORMAL);

    for (const [lemma, input] of clean) {
      const have = ownedByLemma.get(lemma);
      if (have) {
        (have.status === WordStatus.LEARNED ? learned : existing).push(have);
        continue;
      }
      const lex = known.get(lemma);
      toCreate.push(
        this.repo.create({
          studentId: student.id,
          word: input.word,
          lemma,
          translation: input.translation ?? lex?.translation ?? null,
          example: lex?.examples[0] ?? null,
          cefr: lex?.cefr ?? null,
          status: WordStatus.LEARNING,
          stage: CardStage.TRANSLATION,
          stageCorrect: 0,
          correctTotal: 0,
          nextDueAt: new Date(),
          priority,
          source: opts.source,
          sourceReportId: opts.sourceReportId ?? null,
          sourceListId: opts.sourceListId ?? null,
        }),
      );
    }
    const added = toCreate.length > 0 ? await this.repo.save(toCreate) : [];
    return { added, existing, learned };
  }

  /** Fill translation / example / CEFR from the lexicon for words that lack them. */
  async applyLexicon(lemmas: string[]): Promise<number> {
    const known = await this.lexicon.findMany(lemmas);
    if (known.size === 0) return 0;
    const words = await this.repo.find({ where: { lemma: In([...known.keys()]) } });
    let changed = 0;
    for (const w of words) {
      const lex = known.get(w.lemma ?? '');
      if (!lex) continue;
      let touched = false;
      if (!w.translation && lex.translation) {
        w.translation = lex.translation;
        touched = true;
      }
      if (!w.example && lex.examples[0]) {
        w.example = lex.examples[0];
        touched = true;
      }
      if (!w.cefr && lex.cefr) {
        w.cefr = lex.cefr;
        touched = true;
      }
      if (touched) changed += 1;
    }
    if (changed > 0) await this.repo.save(words);
    return changed;
  }

  findById(id: string): Promise<Word | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByWord(studentId: string, raw: string): Promise<Word | null> {
    const lemma = lemmaOf(raw);
    if (!lemma) return null;
    return this.repo
      .createQueryBuilder('w')
      .where('w.student_id = :studentId', { studentId })
      .andWhere('(w.lemma = :lemma OR lower(w.word) = :lemma)', { lemma })
      .getOne();
  }

  async getByWord(studentId: string, raw: string): Promise<Word> {
    const word = await this.findByWord(studentId, raw);
    if (!word) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.WORDS,
        error: ErrorCode.NOT_FOUND,
        meta: { studentId, word: raw },
      });
    }
    return word;
  }

  /** Vocabulary size per student in one query — the dashboard's student list. */
  async countsFor(studentIds: string[]): Promise<Map<string, { total: number; learned: number }>> {
    const out = new Map<string, { total: number; learned: number }>();
    if (studentIds.length === 0) return out;
    const rows = await this.repo
      .createQueryBuilder('w')
      .select('w.student_id', 'studentId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE w.status = '${WordStatus.LEARNED}')`, 'learned')
      .where('w.student_id IN (:...studentIds)', { studentIds })
      .groupBy('w.student_id')
      .getRawMany<{ studentId: string; total: string; learned: string }>();
    for (const r of rows)
      out.set(r.studentId, { total: Number(r.total), learned: Number(r.learned) });
    return out;
  }

  /** How a teacher list landed: students who accepted at least one word, words accepted, words learned. */
  async coverageOfList(
    listId: string,
  ): Promise<{ students: number; words: number; learned: number }> {
    const row = await this.repo
      .createQueryBuilder('w')
      .select('COUNT(DISTINCT w.student_id)', 'students')
      .addSelect('COUNT(*)', 'words')
      .addSelect(`COUNT(*) FILTER (WHERE w.status = '${WordStatus.LEARNED}')`, 'learned')
      .where('w.source_list_id = :listId', { listId })
      .getRawOne<{ students: string; words: string; learned: string }>();
    return {
      students: Number(row?.students ?? 0),
      words: Number(row?.words ?? 0),
      learned: Number(row?.learned ?? 0),
    };
  }

  /** Lemmas the student has (any status) — for teacher-list recommendations and import previews. */
  async ownedLemmas(studentId: string): Promise<Set<string>> {
    const rows = await this.repo
      .createQueryBuilder('w')
      .select('COALESCE(w.lemma, lower(w.word))', 'lemma')
      .where('w.student_id = :studentId', { studentId })
      .getRawMany<{ lemma: string }>();
    return new Set(rows.map((r) => r.lemma));
  }

  search(studentId: string, opts: SearchOptions = {}): Promise<Word[]> {
    const qb = this.repo
      .createQueryBuilder('w')
      .where('w.student_id = :studentId', { studentId })
      .orderBy('w.created_at', 'DESC')
      .take(Math.min(opts.limit ?? 20, 100));
    if (opts.query) {
      const q = `%${opts.query.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((b) => {
          b.where('lower(w.word) LIKE :q', { q }).orWhere('lower(w.translation) LIKE :q', { q });
        }),
      );
    }
    if (opts.status) qb.andWhere('w.status = :status', { status: opts.status });
    if (opts.cefr) qb.andWhere('w.cefr = :cefr', { cefr: opts.cefr });
    if (opts.source) qb.andWhere('w.source = :source', { source: opts.source });
    if (opts.priority) qb.andWhere('w.priority = :priority', { priority: opts.priority });
    return qb.getMany();
  }

  async summary(studentId: string): Promise<VocabularySummary> {
    const rows = await this.repo.find({ where: { studentId } });
    const summary: VocabularySummary = {
      total: rows.length,
      learning: 0,
      learned: 0,
      priority: 0,
      byCefr: {},
      bySource: {},
    };
    for (const w of rows) {
      if (w.status === WordStatus.LEARNED) summary.learned += 1;
      else summary.learning += 1;
      if (w.priority === WordPriority.HIGH && w.status !== WordStatus.LEARNED)
        summary.priority += 1;
      const cefr = w.cefr ?? 'unknown';
      summary.byCefr[cefr] = (summary.byCefr[cefr] ?? 0) + 1;
      summary.bySource[w.source] = (summary.bySource[w.source] ?? 0) + 1;
    }
    return summary;
  }

  /** LEARNED excludes the word from cards; LEARNING returns it with its stage kept. */
  async setStatus(word: Word, status: WordStatus): Promise<Word> {
    if (word.status === status) return word;
    word.status = status;
    word.learnedAt = status === WordStatus.LEARNED ? new Date() : null;
    if (status === WordStatus.LEARNING) word.nextDueAt = new Date();
    return this.repo.save(word);
  }

  async setPriority(word: Word, priority: WordPriority): Promise<Word> {
    if (word.priority === priority) return word;
    word.priority = priority;
    return this.repo.save(word);
  }

  async updateTranslation(word: Word, translation: string): Promise<Word> {
    word.translation = displayWord(translation) || word.translation;
    return this.repo.save(word);
  }

  /** The whole vocabulary as a file body. CSV uses `;` — Excel in a Russian locale opens it as columns. */
  async exportText(studentId: string, format: 'csv' | 'txt'): Promise<string> {
    const rows = await this.repo.find({ where: { studentId }, order: { createdAt: 'ASC' } });
    if (format === 'txt') {
      return (
        rows.map((w) => (w.translation ? `${w.word} — ${w.translation}` : w.word)).join('\n') + '\n'
      );
    }
    const esc = (v: string | null): string => `"${(v ?? '').replace(/"/g, '""')}"`;
    const header = [
      'word',
      'translation',
      'example',
      'cefr',
      'status',
      'stage',
      'source',
      'added',
    ].join(';');
    const lines = rows.map((w) =>
      [
        esc(w.word),
        esc(w.translation),
        esc(w.example),
        esc(w.cefr),
        esc(w.status),
        String(w.stage),
        esc(w.source),
        w.createdAt.toISOString().slice(0, 10),
      ].join(';'),
    );
    return '﻿' + [header, ...lines].join('\n') + '\n';
  }
}
