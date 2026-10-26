import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WordLexicon } from './word-lexicon.entity';

/** School-wide cache of enriched words: one AI enrichment per lemma, ever. */
@Injectable()
export class LexiconService {
  private readonly logger = new Logger(LexiconService.name);

  constructor(
    @InjectRepository(WordLexicon)
    private readonly repo: Repository<WordLexicon>,
  ) {}

  async findMany(lemmas: string[]): Promise<Map<string, WordLexicon>> {
    if (lemmas.length === 0) return new Map();
    const rows = await this.repo.find({ where: { lemma: In(lemmas) } });
    return new Map(rows.map((r) => [r.lemma, r]));
  }

  /** Lemmas without a lexicon row yet. */
  async missing(lemmas: string[]): Promise<string[]> {
    const known = await this.findMany(lemmas);
    return lemmas.filter((l) => !known.has(l));
  }

  /**
   * Store enriched rows, one statement per lemma. The model may repeat a lemma (Postgres
   * rejects a multi-row upsert that touches one row twice — the whole batch was lost that way)
   * or return something the column cannot take; a bad row is logged and skipped, the rest stay.
   * Returns how many rows were stored.
   */
  async upsert(rows: Array<Omit<WordLexicon, 'createdAt' | 'updatedAt'>>): Promise<number> {
    const byLemma = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (row.lemma && !byLemma.has(row.lemma)) byLemma.set(row.lemma, row);
    let stored = 0;
    for (const row of byLemma.values()) {
      try {
        await this.repo.upsert(row, ['lemma']);
        stored += 1;
      } catch (err) {
        this.logger.warn(`lexicon row skipped for "${row.lemma}": ${(err as Error).message}`);
      }
    }
    return stored;
  }

  /** Distinct lemmas of students' words that have no lexicon row (enrichment failed or never ran). */
  async missingForWords(): Promise<string[]> {
    const rows = await this.repo.manager
      .createQueryBuilder()
      .select('DISTINCT w.lemma', 'lemma')
      .from('words', 'w')
      .leftJoin(WordLexicon, 'l', 'l.lemma = w.lemma')
      .where('w.lemma IS NOT NULL AND l.lemma IS NULL')
      .orderBy('w.lemma')
      .getRawMany<{ lemma: string }>();
    return rows.map((r) => r.lemma);
  }
}
