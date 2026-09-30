import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Check,
} from 'typeorm';
import { bigintToNumber } from '../../common/transformers';
import { enumCheck } from '../../common/db-checks';
import { Group } from '../groups/group.entity';
import { GroupLevel } from '../groups/level';
import { WordListScope, WordListStatus } from './word.enums';

/**
 * A teacher's list of words the students should know. Unlike a group import
 * it is an offer: each student sees the words missing from their vocabulary
 * and decides. Accepted words get source TEACHER and priority HIGH.
 */
@Entity({ name: 'word_lists' })
@Check('chk_word_lists_scope', enumCheck('scope', WordListScope))
@Check('chk_word_lists_status', enumCheck('status', WordListStatus))
@Check('chk_word_lists_level', enumCheck('level', GroupLevel))
@Check(
  'chk_word_lists_target',
  `("scope" = 'GROUP' AND "group_chat_id" IS NOT NULL) OR ("scope" = 'LEVEL' AND "level" IS NOT NULL) OR ("scope" = 'ALL')`,
)
@Index('idx_word_lists_status', ['status'])
export class WordList {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'varchar', length: 10 })
  scope!: WordListScope;

  @Column({
    type: 'bigint',
    name: 'group_chat_id',
    nullable: true,
    transformer: bigintToNumber,
  })
  groupChatId!: number | null;

  @ManyToOne(() => Group, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_chat_id' })
  group?: Group;

  @Column({ type: 'varchar', length: 20, nullable: true })
  level!: GroupLevel | null;

  /** Telegram id of the teacher / owner who created it. */
  @Column({ type: 'bigint', name: 'created_by', transformer: bigintToNumber })
  createdBy!: number;

  @Column({ type: 'varchar', length: 10, default: WordListStatus.ACTIVE })
  status!: WordListStatus;

  @OneToMany(() => WordListItem, (item) => item.list)
  items?: WordListItem[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}

@Entity({ name: 'word_list_items' })
@Index('uq_word_list_items_lemma', ['listId', 'lemma'], { unique: true })
export class WordListItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'list_id' })
  listId!: string;

  @ManyToOne(() => WordList, (list) => list.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'list_id' })
  list?: WordList;

  @Column({ type: 'text' })
  word!: string;

  /** Normalized key — matched against the student's words. */
  @Column({ type: 'text' })
  lemma!: string;

  @Column({ type: 'text', nullable: true })
  translation!: string | null;

  @Column({ type: 'int', default: 0 })
  position!: number;
}

/** The student hid this suggestion — never offered again; the teacher sees "did not add". */
@Entity({ name: 'word_list_dismissals' })
export class WordListDismissal {
  @Column({ type: 'uuid', name: 'student_id', primary: true })
  studentId!: string;

  @Column({ type: 'uuid', name: 'item_id', primary: true })
  itemId!: string;

  @ManyToOne(() => WordListItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item?: WordListItem;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
