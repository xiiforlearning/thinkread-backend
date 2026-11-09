import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppConfigService } from '../../../config/config.service';
import { CardsService } from '../../../domain/cards/cards.service';
import { UsageService } from '../../../domain/ai/usage.service';
import { Report } from '../../../domain/reports/report.entity';
import { globalConfig } from '../../../config/global.config';
import { AdminRole } from '../../../domain/admins/admin.entity';
import { FlagStatus } from '../../../domain/flags/flag.enums';
import { FlagsService } from '../../../domain/flags/flags.service';
import { GroupsService } from '../../../domain/groups/groups.service';
import { recentWeekStarts, weekBounds } from '../../../domain/norms/week';
import { ReportsService } from '../../../domain/reports/reports.service';
import { Health, healthOf, silentDays } from '../../../domain/students/health';
import { displayNameOf } from '../../../domain/students/name-validation';
import { StudentStatus } from '../../../domain/students/student.enums';
import { Student } from '../../../domain/students/student.entity';
import { StudentsService } from '../../../domain/students/students.service';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentPrincipal, Principal, Roles } from '../auth/principal';
import { reportView } from '../me/serializers';
import { OverviewQueryDto } from './dto';
import { AdminScopeService } from './scope';
import { GroupRef, studentRef } from './serializers';

const HISTORY_WEEKS = 8;
const DAY_MS = 86_400_000;
const ATTENTION_WEEKS = 3;

/** 11 · Обзор — the owner's and teacher's landing page. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(AdminRole.OWNER, AdminRole.TEACHER)
@Controller('admin/overview')
export class AdminOverviewController {
  constructor(
    private readonly scope: AdminScopeService,
    private readonly students: StudentsService,
    private readonly groups: GroupsService,
    private readonly reports: ReportsService,
    private readonly flags: FlagsService,
    private readonly cards: CardsService,
    private readonly usage: UsageService,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Week overview: norms, health by group, 8-week history, top readers, attention list',
  })
  async overview(
    @CurrentPrincipal() principal: Principal,
    @Query() q: OverviewQueryDto,
  ): Promise<Record<string, unknown>> {
    const scope = await this.scope.resolve(principal);
    const now = new Date();
    const tz = this.config.timezone;
    const active = await this.scope.visibleStudents(scope, [StudentStatus.ACTIVE]);
    const ids = active.map((s) => s.id);
    const starts = recentWeekStarts(now, tz, HISTORY_WEEKS + 2);
    const offset = q.week === 'last' ? 1 : 0;
    const target = starts[offset];
    const previous = starts[offset + 1];

    const pending = await this.scope.visibleStudents(scope, [StudentStatus.PENDING_NAME]);
    const targetBounds = weekBounds(new Date(`${target}T12:00:00Z`), tz);
    const monthFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [
      counts,
      weekTotals,
      groups,
      groupsByStudent,
      newFlags,
      flagsRaised,
      confirmed,
      latest,
      archivedCount,
      aiMonth,
    ] = await Promise.all([
      this.reports.countsByWeek(ids, starts),
      this.reports.totalsByWeek(ids, [target, previous]),
      this.scope.visibleGroups(scope),
      this.students.memberGroupIdsFor([...ids, ...pending.map((s) => s.id)]),
      this.flags.list({ status: FlagStatus.NEW, studentIds: scope.isOwner ? null : ids }),
      this.flags.countRaisedBetween(scope.isOwner ? null : ids, targetBounds.from, targetBounds.to),
      this.flags.confirmedInWeek(ids, target),
      this.reports.latest(ids, 20),
      scope.isOwner
        ? this.students.countByStatus().then((c) => c.ARCHIVED)
        : this.scope.visibleStudents(scope, [StudentStatus.ARCHIVED]).then((l) => l.length),
      scope.isOwner ? this.usage.report(monthFrom, now, 0) : Promise.resolve(null),
    ]);

    const norms = globalConfig.norms;
    const cell = (id: string, week: string): { reading: number; listening: number } =>
      counts.get(`${id}|${week}`) ?? { reading: 0, listening: 0 };
    const rate = (week: string, pick: 'reading' | 'listening'): number => {
      if (ids.length === 0) return 0;
      const norm = pick === 'reading' ? norms.readingPerWeek : norms.listeningPerWeek;
      const met = ids.filter((id) => cell(id, week)[pick] >= norm).length;
      return Math.round((met / ids.length) * 100) / 100;
    };

    const groupTitle = new Map(groups.map((g) => [g.chatId, g.title]));
    const refsOf = (id: string): GroupRef[] =>
      (groupsByStudent.get(id) ?? [])
        .filter((chatId) => groupTitle.has(chatId))
        .map((chatId) => ({ chatId, title: groupTitle.get(chatId) as string }));

    const healthByStudent = new Map<string, Health>(active.map((s) => [s.id, healthOf(s, now)]));
    const healthByGroup = groups.map((g) => {
      const inGroup = (s: Student): boolean => (groupsByStudent.get(s.id) ?? []).includes(g.chatId);
      const members = active.filter(inGroup);
      const tally = { good: 0, warn: 0, bad: 0 };
      for (const m of members) tally[healthByStudent.get(m.id) ?? 'good'] += 1;
      return {
        chatId: g.chatId,
        title: g.title,
        level: g.level,
        ...tally,
        // Registered (ACTIVE) members — the ones health is about — and those still to register.
        members: members.length,
        pending: pending.filter(inGroup).length,
      };
    });
    const totals = { good: 0, warn: 0, bad: 0 };
    for (const h of healthByStudent.values()) totals[h] += 1;

    const attention = active
      .map((s) => {
        const weeks = starts.slice(0, ATTENTION_WEEKS).map((w) => cell(s.id, w));
        const noReports = weeks.every((w) => w.reading === 0 && w.listening === 0);
        const health = healthByStudent.get(s.id) ?? 'good';
        return { s, noReports, health, silent: silentDays(s, now) };
      })
      .filter((x) => x.noReports || x.health !== 'good')
      .sort((a, b) => {
        const rank = { bad: 0, warn: 1, good: 2 };
        return (
          Number(b.noReports) - Number(a.noReports) ||
          rank[a.health] - rank[b.health] ||
          b.silent - a.silent
        );
      })
      .slice(0, 10)
      .map(({ s, noReports, health, silent }) => ({
        ...studentRef(s, refsOf(s.id)),
        health,
        silentDays: silent,
        dmBlocked: s.dmBlocked,
        noReportsForWeeks: noReports ? ATTENTION_WEEKS : 0,
        week: {
          ...cell(s.id, target),
          readingNorm: norms.readingPerWeek,
          listeningNorm: norms.listeningPerWeek,
        },
      }));

    const byId = new Map(active.map((s) => [s.id, s]));
    // D3: Top 3 by the norm — both norms met first, then filled windows, reports, pages as the
    // tie-break; students with a flag the teacher confirmed this week are left out.
    const total = (
      id: string,
      week: string,
    ): { reading: number; listening: number; pages: number } =>
      weekTotals.get(`${id}|${week}`) ?? { reading: 0, listening: 0, pages: 0 };
    const topReaders = active
      .filter((s) => !confirmed.has(s.id))
      .map((s) => {
        const c = cell(s.id, target);
        const t = total(s.id, target);
        const normMet = c.reading >= norms.readingPerWeek && c.listening >= norms.listeningPerWeek;
        return {
          ...studentRef(s, refsOf(s.id)),
          sortName: displayNameOf(s),
          normMet,
          week: {
            ...c,
            readingNorm: norms.readingPerWeek,
            listeningNorm: norms.listeningPerWeek,
          },
          reports: t.reading + t.listening,
          pages: t.pages,
          score: [
            Number(normMet),
            Math.min(c.reading, norms.readingPerWeek) +
              Math.min(c.listening, norms.listeningPerWeek),
            t.reading + t.listening,
            t.pages,
          ],
        };
      })
      .filter((r) => r.reports > 0)
      .sort((a, b) => {
        for (let i = 0; i < a.score.length; i += 1)
          if (a.score[i] !== b.score[i]) return b.score[i] - a.score[i];
        return a.sortName.localeCompare(b.sortName);
      })
      .slice(0, 3)
      .map(({ score: _score, sortName: _name, ...rest }) => rest);

    const sumWeek = (week: string): { total: number; reading: number; listening: number } => {
      let reading = 0;
      let listening = 0;
      for (const id of ids) {
        const t = total(id, week);
        reading += t.reading;
        listening += t.listening;
      }
      return { total: reading + listening, reading, listening };
    };
    // D2: the latest reports as a feed — who handed in what, without paging a 70-row list.
    const latestReports = latest.map((r: Report) => {
      const s = byId.get(r.studentId);
      return {
        ...reportView(r),
        student: s
          ? { ...studentRef(s, refsOf(s.id)), health: healthByStudent.get(s.id) ?? 'good' }
          : null,
        week: {
          ...cell(r.studentId, r.weekStart),
          readingNorm: norms.readingPerWeek,
          listeningNorm: norms.listeningPerWeek,
        },
      };
    });

    return {
      weekStart: target,
      generatedAt: now.toISOString(),
      stats: {
        activeStudents: ids.length,
        pendingStudents: pending.length,
        archivedStudents: archivedCount,
        groups: groups.length,
        readingRate: rate(target, 'reading'),
        readingRateDelta:
          Math.round((rate(target, 'reading') - rate(previous, 'reading')) * 100) / 100,
        listeningRate: rate(target, 'listening'),
        listeningRateDelta:
          Math.round((rate(target, 'listening') - rate(previous, 'listening')) * 100) / 100,
        cardsThisWeek: await this.countCards(ids, target, tz),
        newFlags: newFlags.length,
        /** D1: flags raised in the target week, any status — "9 of 17 new". */
        flagsRaisedThisWeek: flagsRaised,
        reportsThisWeek: sumWeek(target),
        reportsLastWeek: sumWeek(previous),
        /** Owner only: this month's AI spend so far. */
        aiMonth: aiMonth
          ? { costUsd: aiMonth.costUsd, tokens: aiMonth.tokens, calls: aiMonth.calls }
          : null,
      },
      healthByGroup,
      healthTotals: totals,
      history: starts
        .slice(offset, offset + HISTORY_WEEKS)
        .map((w) => ({
          weekStart: w,
          reading: rate(w, 'reading'),
          listening: rate(w, 'listening'),
          students: ids.length,
        }))
        .reverse(),
      topReaders,
      attention,
      latestReports,
    };
  }

  /** Answered cards in the local week starting on `weekStart`. */
  private countCards(ids: string[], weekStart: string, tz: string): Promise<number> {
    const { from } = weekBounds(new Date(`${weekStart}T12:00:00Z`), tz);
    return this.cards.countAnswered(ids, from, new Date(from.getTime() + 7 * DAY_MS));
  }
}
