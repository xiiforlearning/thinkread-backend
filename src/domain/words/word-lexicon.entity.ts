import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn, Check } from 'typeorm';
import { enumCheck } from '../../common/db-checks';
import { CefrLevel } from './word.enums';

/**
 * School-wide cache of AI-enriched words: a word is enriched once, no matter
 * how many students add it. Holds everything cards need (stages 1–2 are
 * checked without AI).
 */
@Entity({ name: 'word_lexicon' })
@Check('chk_word_lexicon_cefr', enumCheck('cefr', CefrLevel))
export class WordLexicon {
  @PrimaryColumn({ type: 'text' })
  lemma!: string;

  @Column({ type: 'text' })
  translation!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  examples!: string[];

  @Column({ type: 'varchar', length: 2, nullable: true })
  cefr!: CefrLevel | null;

  /** Accepted forms for the stage-2 gap (e.g. procrastinate, procrastinated, procrastinating). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  forms!: string[];

  /** Sentences with `___` for stage 2, each with a Russian hint. */
  @Column({
    type: 'jsonb',
    name: 'gap_sentences',
    default: () => "'[]'",
  })
  gapSentences!: Array<{ sentence: string; hint: string }>;

  /** Wrong translation options for stage-1 multiple choice. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  distractors!: string[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
