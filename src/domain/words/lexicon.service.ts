import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WordLexicon } from './word-lexicon.entity';

/** School-wide cache of enriched words: one AI enrichment per lemma, ever. */
@Injectable()
export class LexiconService {
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

  async upsert(rows: Array<Omit<WordLexicon, 'createdAt' | 'updatedAt'>>): Promise<void> {
    if (rows.length === 0) return;
    await this.repo.upsert(rows, ['lemma']);
  }
}
