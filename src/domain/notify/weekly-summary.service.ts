import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/config.service';
import { globalConfig } from '../../config/global.config';
import { plural } from '../../common/plural';
import { AdminRole } from '../admins/admin.entity';
import { AccessService } from '../admins/access.service';
import { CardsService } from '../cards/cards.service';
import { FlagKind, FlagStatus } from '../flags/flag.enums';
import { FlagsService } from '../flags/flags.service';
import { GroupsService } from '../groups/groups.service';
import { recentWeekStarts, weekBounds } from '../norms/week';
import { ReportsService } from '../reports/reports.service';
import { Health, healthOf, silentDays } from '../students/health';
import { displayNameOf } from '../students/name-validation';
import { Student } from '../students/student.entity';
import { StudentStatus } from '../students/student.enums';
import { StudentsService } from '../students/students.service';
import { summaryMessages } from './messages';
import { NOTIFIER_PORT, NotifierPort } from './notifier.port';

export interface WeeklySummary {
  weekStart: string;
  weekLabel: string;
  students: number;
  readingRate: number;
  readingRateDelta: number;
  listeningRate: number;
  listeningRateDelta: number;
  cardsAnswered: number;
  health: { good: number; warn: number; bad: number };
  groups: Array<{
    chatId: number;
    title: string;
    students: number;
    readingRate: number;
    listeningRate: number;
  }>;
  /** No report at all in the week — the customer's "reason for a presentation". */
  missed: Array<{ id: string; name: string; groups: string; silentDays: number }>;
  topReaders: Array<{ id: string; name: string; groups: string; pages: number }>;
  newFlags: number;
}

export interface WeeklySummaryRun {
  summary: WeeklySummary;
  /** NORM_MISSED_WEEK flags raised (idempotent per student and week). */
  flagged: number;
  /** Telegram ids the summary went to. */
  sentTo: number[];
}

const DAY_MS = 86_400_000;

/**
 * Monday morning for the owner and the teachers: last week's norm rates, health,
 * groups, who handed in nothing (→ a quiet NORM_MISSED_WEEK flag), top readers.
 * `build()` is also the dashboard preview; `run()` flags and sends.
 */
@Injectable()
export class WeeklySummaryService {
  private readonly logger = new Logger(WeeklySummaryService.name);

  constructor(
    private readonly students: StudentsService,
    private readonly groups: GroupsService,
    private readonly reports: ReportsService,
    private readonly flags: FlagsService,
    private readonly cards: CardsService,
    private readonly access: AccessService,
    private readonly config: AppConfigService,
    @Inject(NOTIFIER_PORT) private readonly notifier: NotifierPort,
  ) {}

  /** The summary of the last complete week (`offset` 1) or the current one (0), scoped to `studentIds` when given. */
  async build(
    now: Date,
    offset: 0 | 1 = 1,
    studentIds: string[] | null = null,
    groupIds: number[] | null = null,
  ): Promise<WeeklySummary> {
    const tz = this.config.timezone;
    const starts = recentWeekStarts(now, tz, offset + 2);
    const week = starts[offset];
    const previous = starts[offset + 1];
    const all = await this.students.findAll({ statuses: [StudentStatus.ACTIVE] });
    const active = studentIds ? all.filter((s) => studentIds.includes(s.id)) : all;
    const ids = active.map((s) => s.id);
    const [counts, groupsAll, byStudent, topRaw, flags] = await Promise.all([
      this.reports.countsByWeek(ids, [week, previous]),
      this.groups.findAllActive(),
      this.students.memberGroupIdsFor(ids),
      this.reports.topReaders(ids, week, 3),
      this.flags.list({ status: FlagStatus.NEW, studentIds: ids, limit: 500 }),
    ]);
    const groups = groupIds ? groupsAll.filter((g) => groupIds.includes(g.chatId)) : groupsAll;
    const title = new Map(groups.map((g) => [g.chatId, g.title]));
    const groupsOf = (id: string): string =>
      (byStudent.get(id) ?? [])
        .map((chatId) => title.get(chatId))
        .filter((t): t is string => !!t)
        .join(', ');
    const norms = globalConfig.norms;
    const cell = (id: string, w: string): { reading: number; listening: number } =>
      counts.get(`${id}|${w}`) ?? { reading: 0, listening: 0 };
    const rate = (list: Student[], w: string, pick: 'reading' | 'listening'): number => {
      if (list.length === 0) return 0;
      const norm = pick === 'reading' ? norms.readingPerWeek : norms.listeningPerWeek;
      return (
        Math.round((list.filter((s) => cell(s.id, w)[pick] >= norm).length / list.length) * 100) /
        100
      );
    };
    const health = { good: 0, warn: 0, bad: 0 };
    for (const s of active) health[healthOf(s, now) as Health] += 1;
    const bounds = weekBounds(new Date(`${week}T12:00:00Z`), tz);
    const byId = new Map(active.map((s) => [s.id, s]));
    const missed = active
      .filter((s) => {
        const c = cell(s.id, week);
        return c.reading === 0 && c.listening === 0;
      })
      .map((s) => ({
        id: s.id,
        name: displayNameOf(s),
        groups: groupsOf(s.id),
        silentDays: silentDays(s, now),
      }))
      .sort((a, b) => b.silentDays - a.silentDays);
    return {
      weekStart: week,
      weekLabel: weekLabel(week),
      students: active.length,
      readingRate: rate(active, week, 'reading'),
      readingRateDelta:
        Math.round((rate(active, week, 'reading') - rate(active, previous, 'reading')) * 100) / 100,
      listeningRate: rate(active, week, 'listening'),
      listeningRateDelta:
        Math.round((rate(active, week, 'listening') - rate(active, previous, 'listening')) * 100) /
        100,
      cardsAnswered: await this.cards.countAnswered(ids, bounds.from, bounds.to),
      health,
      groups: groups.map((g) => {
        const members = active.filter((s) => (byStudent.get(s.id) ?? []).includes(g.chatId));
        return {
          chatId: g.chatId,
          title: g.title,
          students: members.length,
          readingRate: rate(members, week, 'reading'),
          listeningRate: rate(members, week, 'listening'),
        };
      }),
      missed,
      topReaders: topRaw
        .map((r) => {
          const s = byId.get(r.studentId);
          return s
            ? { id: s.id, name: displayNameOf(s), groups: groupsOf(s.id), pages: r.pages }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
      newFlags: flags.filter(
        (f) =>
          f.createdAt >= bounds.from && f.createdAt < new Date(bounds.to.getTime() + 7 * DAY_MS),
      ).length,
    };
  }

  /** Flag the students who handed in nothing last week and send the summaries. */
  async run(now = new Date()): Promise<WeeklySummaryRun> {
    const summary = await this.build(now, 1);
    let flagged = 0;
    for (const m of summary.missed) {
      const before = await this.flags.list({
        status: FlagStatus.NEW,
        kind: FlagKind.NORM_MISSED_WEEK,
        studentId: m.id,
        limit: 5,
      });
      if (before.some((f) => f.reason?.includes(summary.weekLabel))) continue;
      await this.flags.raise({
        studentId: m.id,
        reportId: null,
        kind: FlagKind.NORM_MISSED_WEEK,
        reason: `Неделя ${summary.weekLabel}: не сдано ни одного из ${globalConfig.norms.readingPerWeek + globalConfig.norms.listeningPerWeek} отчётов. По правилу школы — повод для презентации.`,
      });
      flagged += 1;
    }
    const sentTo: number[] = [];
    if (await this.notifier.sendToUser(this.access.ownerTelegramId, this.format(summary, true)))
      sentTo.push(this.access.ownerTelegramId);
    const staff = await this.access.listStaff();
    for (const t of staff) {
      if (t.role !== AdminRole.TEACHER || t.groups.length === 0) continue;
      if (t.telegramUserId === this.access.ownerTelegramId) continue;
      const groupIds = t.groups.map((g) => g.chatId);
      const ids = (await this.students.findByGroups(groupIds)).map((s) => s.id);
      const own = await this.build(now, 1, ids, groupIds);
      if (await this.notifier.sendToUser(t.telegramUserId, this.format(own, false)))
        sentTo.push(t.telegramUserId);
    }
    this.logger.log(
      `weekly summary ${summary.weekLabel}: students=${summary.students} missed=${summary.missed.length} flagged=${flagged} sentTo=${sentTo.length}`,
    );
    return { summary, flagged, sentTo };
  }

  /** Telegram text; the owner's version has the flags line. */
  format(s: WeeklySummary, owner: boolean): string {
    const pct = (v: number): string => `${Math.round(v * 100)}%`;
    const delta = (d: number): string => {
      const pp = Math.round(d * 100);
      return pp === 0 ? '' : ` (${pp > 0 ? '+' : '−'}${Math.abs(pp)} п.п.)`;
    };
    const lines = [summaryMessages.title(s.weekLabel)];
    if (s.students === 0) {
      lines.push(summaryMessages.noStudents);
      return lines.join('\n');
    }
    lines.push(
      `Студентов: ${s.students}. Норма по чтению — ${pct(s.readingRate)}${delta(s.readingRateDelta)}, по аудированию — ${pct(s.listeningRate)}${delta(s.listeningRateDelta)}. Карточек отвечено: ${s.cardsAnswered}.`,
      `Здоровье: ${s.health.good} активны · ${s.health.warn} отстают · ${s.health.bad} проблемных.`,
    );
    if (s.groups.length > 0) {
      lines.push(
        '',
        'По группам:',
        ...s.groups.map(
          (g) =>
            `• ${g.title} — чтение ${pct(g.readingRate)}, аудирование ${pct(g.listeningRate)} (${g.students})`,
        ),
      );
    }
    if (s.missed.length > 0) {
      lines.push(
        '',
        `Ни одного отчёта за неделю — ${s.missed.length} ${plural(s.missed.length, 'студент', 'студента', 'студентов')} (повод для презентации):`,
        ...s.missed
          .slice(0, 15)
          .map(
            (m) =>
              `• ${m.name}${m.groups ? ` (${m.groups})` : ''} — ${m.silentDays} ${plural(m.silentDays, 'день', 'дня', 'дней')} тишины`,
          ),
      );
      if (s.missed.length > 15) lines.push(`…и ещё ${s.missed.length - 15}`);
    } else lines.push('', 'Все сдали хотя бы один отчёт.');
    if (s.topReaders.length > 0) {
      lines.push(
        '',
        'Топ читателей:',
        ...s.topReaders.map((t, i) => `${i + 1}. ${t.name} — ${t.pages} стр.`),
      );
    }
    if (owner && s.newFlags > 0)
      lines.push('', `Новых флагов на проверку: ${s.newFlags} — откройте дашборд.`);
    return lines.join('\n');
  }
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** "29 сен – 5 окт" / "22–28 сен" from a Monday key. */
export function weekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const d = (x: Date): number => x.getUTCDate();
  const m = (x: Date): string => MONTHS[x.getUTCMonth()];
  return m(start) === m(end)
    ? `${d(start)}–${d(end)} ${m(end)}`
    : `${d(start)} ${m(start)} – ${d(end)} ${m(end)}`;
}
