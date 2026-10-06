import { Group } from '../../../domain/groups/group.entity';
import { listeningMethodFor, requiresRetelling } from '../../../domain/groups/level';
import { Report } from '../../../domain/reports/report.entity';
import { WeekProgress } from '../../../domain/reports/reports.service';
import { displayNameOf } from '../../../domain/students/name-validation';
import { Student } from '../../../domain/students/student.entity';
import { WordListItem } from '../../../domain/words/word-list.entity';
import { Word } from '../../../domain/words/word.entity';

export function profileView(student: Student, groups: Group[]): Record<string, unknown> {
  const method = listeningMethodFor(student.level);
  const calmUntil = student.dialogState.tiredUntil ?? null;
  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    displayName: displayNameOf(student),
    username: student.username,
    status: student.status,
    level: student.level,
    listeningMethod: method,
    retellingRequired: requiresRetelling(method),
    groups: groups.map((g) => ({ chatId: g.chatId, title: g.title, level: g.level })),
    calmMode: calmUntil !== null && new Date(calmUntil) > new Date(),
    calmUntil,
    registeredAt: student.registeredAt,
  };
}

export function wordView(w: Word): Record<string, unknown> {
  return {
    id: w.id,
    word: w.word,
    translation: w.translation,
    example: w.example,
    cefr: w.cefr,
    status: w.status,
    stage: w.stage,
    priority: w.priority,
    source: w.source,
    sourceReportId: w.sourceReportId,
    sourceListId: w.sourceListId,
    nextDueAt: w.nextDueAt,
    createdAt: w.createdAt,
    learnedAt: w.learnedAt,
  };
}

export function reportView(r: Report): Record<string, unknown> {
  return {
    id: r.id,
    type: r.type,
    method: r.method,
    sourceTitle: r.sourceTitle,
    episode: r.episode,
    pages: r.pages,
    summary: r.summary,
    firstPassPct: r.firstPassPct,
    secondPassPct: r.secondPassPct,
    listenCount: r.listenCount,
    unclearParts: r.unclearParts,
    wordsAdded: r.wordsAdded,
    weekStart: r.weekStart,
    createdAt: r.createdAt,
  };
}

export function weekView(p: WeekProgress): Record<string, unknown> {
  return {
    weekStart: p.weekStart,
    reading: { done: p.reading, norm: p.readingNorm },
    listening: { done: p.listening, norm: p.listeningNorm },
  };
}

export function listItemView(i: WordListItem): Record<string, unknown> {
  return { id: i.id, word: i.word, translation: i.translation };
}
