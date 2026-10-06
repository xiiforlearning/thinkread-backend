import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppConfigService } from '../../../config/config.service';
import { CardsService } from '../../../domain/cards/cards.service';
import { globalConfig } from '../../../config/global.config';
import { AdminRole } from '../../../domain/admins/admin.entity';
import { FlagStatus } from '../../../domain/flags/flag.enums';
import { FlagsService } from '../../../domain/flags/flags.service';
import { GroupsService } from '../../../domain/groups/groups.service';
import { recentWeekStarts, weekBounds } from '../../../domain/norms/week';
import { ReportsService } from '../../../domain/reports/reports.service';
import { Health, healthOf, silentDays } from '../../../domain/students/health';
import { StudentStatus } from '../../../domain/students/student.enums';
import { StudentsService } from '../../../domain/students/students.service';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentPrincipal, Principal, Roles } from '../auth/principal';
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

    const [counts, groups, groupsByStudent, newFlags, topRaw, archivedCount] = await Promise.all([
      this.reports.countsByWeek(ids, starts),
      this.scope.visibleGroups(scope),
      this.students.memberGroupIdsFor(ids),
      this.flags.list({ status: FlagStatus.NEW, studentIds: scope.isOwner ? null : ids }),
      this.reports.topReaders(ids, target, 3),
      scope.isOwner
        ? this.students.countByStatus().then((c) => c.ARCHIVED)
        : this.scope.visibleStudents(scope, [StudentStatus.ARCHIVED]).then((l) => l.length),
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
      const members = active.filter((s) => (groupsByStudent.get(s.id) ?? []).includes(g.chatId));
      const tally = { good: 0, warn: 0, bad: 0 };
      for (const m of members) tally[healthByStudent.get(m.id) ?? 'good'] += 1;
      return {
        chatId: g.chatId,
        title: g.title,
        level: g.level,
        ...tally,
        members: members.length,
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
    const topReaders = topRaw
      .map((r) => {
        const s = byId.get(r.studentId);
        return s ? { ...studentRef(s, refsOf(s.id)), pages: r.pages, reports: r.reports } : null;
      })
      .filter((x) => x !== null);

    return {
      weekStart: target,
      generatedAt: now.toISOString(),
      stats: {
        activeStudents: ids.length,
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
    };
  }

  /** Answered cards in the local week starting on `weekStart`. */
  private countCards(ids: string[], weekStart: string, tz: string): Promise<number> {
    const { from } = weekBounds(new Date(`${weekStart}T12:00:00Z`), tz);
    return this.cards.countAnswered(ids, from, new Date(from.getTime() + 7 * DAY_MS));
  }
}
