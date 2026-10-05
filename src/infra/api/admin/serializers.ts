import { StaffMember } from '../../../domain/admins/access.service';
import { Flag } from '../../../domain/flags/flag.entity';
import { Group } from '../../../domain/groups/group.entity';
import { MembershipCheck } from '../../../domain/membership/membership-check.entity';
import { Report } from '../../../domain/reports/report.entity';
import { Health } from '../../../domain/students/health';
import { displayNameOf } from '../../../domain/students/name-validation';
import { Student } from '../../../domain/students/student.entity';
import { ListCoverage } from '../../../domain/words/word-lists.service';
import { WordList, WordListItem } from '../../../domain/words/word-list.entity';
import { reportView } from '../me/serializers';

export interface GroupRef {
  chatId: number;
  title: string;
}

/** Short form of a student used in every dashboard list. */
export function studentRef(s: Student, groups: GroupRef[]): Record<string, unknown> {
  return {
    id: s.id,
    name: displayNameOf(s),
    firstName: s.firstName,
    lastName: s.lastName,
    displayName: s.displayName,
    username: s.username,
    status: s.status,
    level: s.level,
    groups,
  };
}

export function studentRow(
  s: Student,
  groups: GroupRef[],
  extra: {
    health: Health;
    silentDays: number;
    week: { reading: number; listening: number; readingNorm: number; listeningNorm: number };
    words: { total: number; learned: number };
    newFlags: number;
  },
): Record<string, unknown> {
  return {
    ...studentRef(s, groups),
    health: extra.health,
    silentDays: extra.silentDays,
    dmBlocked: s.dmBlocked,
    lastActivityAt: s.lastActivityAt,
    registeredAt: s.registeredAt,
    week: extra.week,
    words: extra.words,
    newFlags: extra.newFlags,
  };
}

export function studentDetail(
  s: Student,
  groups: GroupRef[],
  extra: { health: Health; silentDays: number },
): Record<string, unknown> {
  return {
    ...studentRef(s, groups),
    telegramUserId: s.telegramUserId,
    health: extra.health,
    silentDays: extra.silentDays,
    dmBlocked: s.dmBlocked,
    manualAccess: s.manualAccess,
    archiveReason: s.archiveReason,
    archivedAt: s.archivedAt,
    calmUntil: s.dialogState.tiredUntil ?? null,
    lastActivityAt: s.lastActivityAt,
    registeredAt: s.registeredAt,
  };
}

export function flagView(
  f: Flag,
  student: Student | null,
  groups: GroupRef[],
  report: Report | null,
): Record<string, unknown> {
  return {
    id: f.id,
    kind: f.kind,
    status: f.status,
    reason: f.reason,
    createdAt: f.createdAt,
    reviewedAt: f.reviewedAt,
    student: student ? studentRef(student, groups) : null,
    report: report ? reportView(report) : null,
  };
}

export function groupView(
  g: Group,
  extra: {
    members: number;
    teachers: Array<{ telegramUserId: number; name: string | null }>;
    week: { reading: number; listening: number; students: number } | null;
  },
): Record<string, unknown> {
  return {
    chatId: g.chatId,
    title: g.title,
    level: g.level,
    isActive: g.isActive,
    members: extra.members,
    teachers: extra.teachers,
    teachersRefreshedAt: g.teachersRefreshedAt,
    /** Share of members who met each norm this week (0..1). */
    week: extra.week,
    createdAt: g.createdAt,
  };
}

export function membershipCheckView(c: MembershipCheck): Record<string, unknown> {
  return {
    id: c.id,
    startedAt: c.startedAt,
    finishedAt: c.finishedAt,
    checked: c.checked,
    archived: c.archived,
    restored: c.restored,
    levelChanged: c.levelChanged,
    failedGroups: c.details?.failedGroups ?? [],
    details: c.details,
  };
}

export function wordListView(
  l: WordList,
  group: GroupRef | null,
  coverage: ListCoverage | null,
  items?: WordListItem[],
): Record<string, unknown> {
  return {
    id: l.id,
    title: l.title,
    scope: l.scope,
    group,
    level: l.level,
    status: l.status,
    createdBy: l.createdBy,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    coverage,
    ...(items
      ? { items: items.map((i) => ({ id: i.id, word: i.word, translation: i.translation })) }
      : {}),
  };
}

export function staffView(s: StaffMember): Record<string, unknown> {
  return { ...s };
}
