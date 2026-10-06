import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { GroupLevel } from '../groups/level';
import { Student } from '../students/student.entity';
import { StudentStatus } from '../students/student.enums';
import { StudentsService } from '../students/students.service';
import { lemmaOf, ParsedWordLine } from './normalize';
import { WordList, WordListDismissal, WordListItem } from './word-list.entity';
import { WordListScope, WordListStatus, WordPriority, WordSource } from './word.enums';
import { AddWordsResult, WordsService } from './words.service';

export interface CreateWordListInput {
  title: string;
  scope: WordListScope;
  groupChatId?: number | null;
  level?: GroupLevel | null;
  createdBy: number;
  items: ParsedWordLine[];
}

export interface ListCoverage {
  /** Active students the list is addressed to. */
  studentsAddressed: number;
  words: number;
  /** Students who accepted at least one word. */
  studentsAdded: number;
  wordsAdded: number;
  wordsLearned: number;
  /** Students who hid at least one item of the list. */
  studentsHidden: number;
}

export interface Recommendation {
  list: WordList;
  items: WordListItem[];
}

/**
 * Teacher word lists and what to offer each student: the items of active
 * lists addressed to them, minus what they already have, minus what they hid.
 */
@Injectable()
export class WordListsService {
  constructor(
    @InjectRepository(WordList)
    private readonly lists: Repository<WordList>,
    @InjectRepository(WordListItem)
    private readonly items: Repository<WordListItem>,
    @InjectRepository(WordListDismissal)
    private readonly dismissals: Repository<WordListDismissal>,
    private readonly words: WordsService,
    private readonly students: StudentsService,
  ) {}

  async create(input: CreateWordListInput): Promise<WordList> {
    const list = await this.lists.save(
      this.lists.create({
        title: input.title.trim(),
        scope: input.scope,
        groupChatId: input.scope === WordListScope.GROUP ? (input.groupChatId ?? null) : null,
        level: input.scope === WordListScope.LEVEL ? (input.level ?? null) : null,
        createdBy: input.createdBy,
        status: WordListStatus.ACTIVE,
      }),
    );
    await this.replaceItems(list.id, input.items);
    return list;
  }

  /** Re-set the items; new lemmas are offered again, removed ones stop being offered. */
  async replaceItems(listId: string, parsed: ParsedWordLine[]): Promise<WordListItem[]> {
    const existing = await this.items.find({ where: { listId } });
    const byLemma = new Map(existing.map((i) => [i.lemma, i]));
    const keep = new Set<string>();
    const rows: WordListItem[] = [];
    parsed.forEach((p, position) => {
      const lemma = lemmaOf(p.word);
      if (!lemma || keep.has(lemma)) return;
      keep.add(lemma);
      const row = byLemma.get(lemma) ?? this.items.create({ listId, lemma });
      row.word = p.word;
      row.translation = p.translation ?? row.translation ?? null;
      row.position = position;
      rows.push(row);
    });
    const gone = existing.filter((i) => !keep.has(i.lemma));
    if (gone.length > 0) await this.items.remove(gone);
    return this.items.save(rows);
  }

  findById(id: string): Promise<WordList | null> {
    return this.lists.findOne({ where: { id } });
  }

  async getById(id: string): Promise<WordList> {
    const list = await this.findById(id);
    if (!list) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.WORDS,
        error: ErrorCode.NOT_FOUND,
        meta: { id },
      });
    }
    return list;
  }

  findAll(): Promise<WordList[]> {
    return this.lists.find({ order: { createdAt: 'DESC' } });
  }

  async setStatus(id: string, status: WordListStatus): Promise<void> {
    await this.lists.update({ id }, { status });
  }

  async setTitle(id: string, title: string): Promise<void> {
    await this.lists.update({ id }, { title: title.trim() });
  }

  itemsOf(listId: string): Promise<WordListItem[]> {
    return this.items.find({ where: { listId }, order: { position: 'ASC' } });
  }

  /** Active students a list is addressed to (its group, its level, or everyone). */
  async addressedStudents(
    list: Pick<WordList, 'scope' | 'groupChatId' | 'level'>,
  ): Promise<Student[]> {
    if (list.scope === WordListScope.GROUP) {
      const members =
        list.groupChatId === null ? [] : await this.students.findByGroups([list.groupChatId]);
      return members.filter((s) => s.status === StudentStatus.ACTIVE);
    }
    const active = await this.students.findAll({ statuses: [StudentStatus.ACTIVE] });
    return list.scope === WordListScope.ALL ? active : active.filter((s) => s.level === list.level);
  }

  /** The teacher's view of one list: how many students it reached and what they did with it. */
  async coverage(list: WordList): Promise<ListCoverage> {
    const [addressed, items, accepted, hidden] = await Promise.all([
      this.addressedStudents(list),
      this.items.count({ where: { listId: list.id } }),
      this.words.coverageOfList(list.id),
      this.dismissals
        .createQueryBuilder('d')
        .innerJoin(WordListItem, 'i', 'i.id = d.item_id')
        .where('i.list_id = :listId', { listId: list.id })
        .select('COUNT(DISTINCT d.student_id)', 'students')
        .getRawOne<{ students: string }>(),
    ]);
    return {
      studentsAddressed: addressed.length,
      words: items,
      studentsAdded: accepted.students,
      wordsAdded: accepted.words,
      wordsLearned: accepted.learned,
      studentsHidden: Number(hidden?.students ?? 0),
    };
  }

  /** Active lists addressed to this student: their groups, their level, or everyone. */
  async listsFor(student: Student): Promise<WordList[]> {
    const groupIds = await this.students.memberGroupIds(student.id);
    const all = await this.lists.find({ where: { status: WordListStatus.ACTIVE } });
    return all.filter((l) => matchesStudent(l, groupIds, student.level));
  }

  /** What to offer: items the student does not have and did not hide, grouped by list. */
  async recommendedFor(student: Student): Promise<Recommendation[]> {
    const lists = await this.listsFor(student);
    if (lists.length === 0) return [];
    const [items, owned, hidden] = await Promise.all([
      this.items.find({
        where: { listId: In(lists.map((l) => l.id)) },
        order: { position: 'ASC' },
      }),
      this.words.ownedLemmas(student.id),
      this.dismissals.find({ where: { studentId: student.id } }),
    ]);
    const hiddenIds = new Set(hidden.map((d) => d.itemId));
    return lists
      .map((list) => ({
        list,
        items: items.filter(
          (i) => i.listId === list.id && !owned.has(i.lemma) && !hiddenIds.has(i.id),
        ),
      }))
      .filter((r) => r.items.length > 0);
  }

  /** Accept recommended words (all, or the given ones) into the student's vocabulary. */
  async accept(student: Student, itemIds: string[] | 'all'): Promise<AddWordsResult> {
    const recs = await this.recommendedFor(student);
    const wanted = itemIds === 'all' ? null : new Set(itemIds);
    const totals: AddWordsResult = { added: [], existing: [], learned: [] };
    for (const rec of recs) {
      const chosen = rec.items.filter((i) => wanted === null || wanted.has(i.id));
      if (chosen.length === 0) continue;
      const result = await this.words.addWords(
        student,
        chosen.map((i) => ({ word: i.word, translation: i.translation })),
        { source: WordSource.TEACHER, sourceListId: rec.list.id, priority: WordPriority.HIGH },
      );
      totals.added.push(...result.added);
      totals.existing.push(...result.existing);
      totals.learned.push(...result.learned);
    }
    return totals;
  }

  /** Hide the given items (or every item still recommended) for this student. */
  async dismiss(student: Student, itemIds: string[] | 'all'): Promise<number> {
    const recs = await this.recommendedFor(student);
    const wanted = itemIds === 'all' ? null : new Set(itemIds);
    const rows = recs
      .flatMap((r) => r.items)
      .filter((i) => wanted === null || wanted.has(i.id))
      .map((i) => this.dismissals.create({ studentId: student.id, itemId: i.id }));
    if (rows.length === 0) return 0;
    await this.dismissals.createQueryBuilder().insert().values(rows).orIgnore().execute();
    return rows.length;
  }
}

export function matchesStudent(
  list: Pick<WordList, 'scope' | 'groupChatId' | 'level'>,
  groupIds: number[],
  level: GroupLevel | null,
): boolean {
  switch (list.scope) {
    case WordListScope.ALL:
      return true;
    case WordListScope.GROUP:
      return list.groupChatId !== null && groupIds.includes(list.groupChatId);
    case WordListScope.LEVEL:
      return list.level !== null && list.level === level;
  }
}
