import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { globalConfig } from '../../../config/global.config';
import { AppConfigService } from '../../../config/config.service';
import { CardsService } from '../../../domain/cards/cards.service';
import { SpotCheckGraderService } from '../../../domain/ai/spot-check-grader.service';
import { GroupsService } from '../../../domain/groups/groups.service';
import { listeningMethodFor, requiresRetelling } from '../../../domain/groups/level';
import { ReportsService } from '../../../domain/reports/reports.service';
import { RegistrationService } from '../../../domain/students/registration.service';
import { Student } from '../../../domain/students/student.entity';
import { StudentsService } from '../../../domain/students/students.service';
import { WordListsService } from '../../../domain/words/word-lists.service';
import { WordsService } from '../../../domain/words/words.service';
import { JwtAuthGuard, StudentGuard } from '../auth/guards';
import { AllowPendingName, CurrentStudent } from '../auth/principal';
import {
  CalendarQueryDto,
  CalmModeDto,
  RecommendationIdsDto,
  RegisterDto,
  SpotCheckAnswerDto,
} from './dto';
import { listItemView, profileView, weekView, wordView } from './serializers';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('me')
export class MeController {
  constructor(
    private readonly students: StudentsService,
    private readonly groups: GroupsService,
    private readonly registration: RegistrationService,
    private readonly reports: ReportsService,
    private readonly words: WordsService,
    private readonly lists: WordListsService,
    private readonly spotChecks: SpotCheckGraderService,
    private readonly cards: CardsService,
    private readonly config: AppConfigService,
  ) {}

  private async profile(student: Student): Promise<Record<string, unknown>> {
    const ids = await this.students.memberGroupIds(student.id);
    const groups = (await Promise.all(ids.map((id) => this.groups.findById(id)))).filter(
      (g) => g !== null,
    );
    return profileView(student, groups);
  }

  @Get()
  @AllowPendingName()
  @ApiOperation({ summary: 'Profile, groups, level, listening method, calm mode' })
  me(@CurrentStudent() student: Student): Promise<Record<string, unknown>> {
    return this.profile(student);
  }

  @Post('register')
  @AllowPendingName()
  @ApiOperation({ summary: 'First login: real first and last name (PENDING_NAME → ACTIVE)' })
  async register(
    @CurrentStudent() student: Student,
    @Body() dto: RegisterDto,
  ): Promise<Record<string, unknown>> {
    const saved = await this.registration.setName(student, dto.firstName, dto.lastName);
    return this.profile(saved);
  }

  @Patch()
  @ApiOperation({ summary: 'Correct the first and last name' })
  async patch(
    @CurrentStudent() student: Student,
    @Body() dto: RegisterDto,
  ): Promise<Record<string, unknown>> {
    const saved = await this.registration.setName(student, dto.firstName, dto.lastName);
    return this.profile(saved);
  }

  @Post('calm-mode')
  @ApiOperation({
    summary: 'Calm mode: fewer, softer reminders for a few days (the norm is unchanged)',
  })
  async calmMode(
    @CurrentStudent() student: Student,
    @Body() dto: CalmModeDto,
  ): Promise<Record<string, unknown>> {
    const tiredUntil = dto.on
      ? new Date(Date.now() + globalConfig.reminders.tiredDays * 86_400_000).toISOString()
      : undefined;
    const saved = await this.students.patchDialogState(student, { tiredUntil });
    return this.profile(saved);
  }

  @Get('progress')
  @ApiOperation({ summary: 'This week: reading and listening against the norm; cards today' })
  async progress(@CurrentStudent() student: Student): Promise<Record<string, unknown>> {
    const now = new Date();
    const week = await this.reports.weekProgress(student.id, now, this.config.timezone);
    const summary = await this.words.summary(student.id);
    const today = await this.cards.today(student.id, now, this.config.timezone);
    const due = await this.cards.queue(student.id, now, this.config.timezone, 100);
    return {
      week: weekView(week),
      cards: { ...today, due: due.length, available: true },
      words: {
        total: summary.total,
        learning: summary.learning,
        learned: summary.learned,
        priority: summary.priority,
      },
    };
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Weekly norm history, newest first' })
  async calendar(
    @CurrentStudent() student: Student,
    @Query() q: CalendarQueryDto,
  ): Promise<Record<string, unknown>[]> {
    const weeks = await this.reports.calendar(
      student.id,
      q.weeks ?? 12,
      new Date(),
      this.config.timezone,
    );
    return weeks.map(weekView);
  }

  @Get('listening-method')
  @ApiOperation({ summary: "The student's listening method and what a report must contain" })
  listeningMethod(@CurrentStudent() student: Student): Record<string, unknown> {
    const method = listeningMethodFor(student.level);
    return { method, level: student.level, retellingRequired: requiresRetelling(method) };
  }

  @Get('recommendations')
  @ApiOperation({ summary: "Teacher's list words the student does not have yet" })
  async recommendations(@CurrentStudent() student: Student): Promise<Record<string, unknown>[]> {
    const recs = await this.lists.recommendedFor(student);
    return recs.map((r) => ({
      list: { id: r.list.id, title: r.list.title },
      items: r.items.map(listItemView),
    }));
  }

  @Post('recommendations/accept')
  @ApiOperation({ summary: 'Add recommended words (all or by item ids) with priority HIGH' })
  async accept(
    @CurrentStudent() student: Student,
    @Body() dto: RecommendationIdsDto,
  ): Promise<Record<string, unknown>> {
    const result = await this.lists.accept(student, dto.all ? 'all' : (dto.itemIds ?? []));
    return {
      added: result.added.map(wordView),
      alreadyHad: result.existing.length + result.learned.length,
    };
  }

  @Post('recommendations/dismiss')
  @ApiOperation({ summary: 'Hide recommendations (all or by item ids)' })
  async dismiss(
    @CurrentStudent() student: Student,
    @Body() dto: RecommendationIdsDto,
  ): Promise<Record<string, unknown>> {
    const dismissed = await this.lists.dismiss(student, dto.all ? 'all' : (dto.itemIds ?? []));
    return { dismissed };
  }

  @Get('spot-check')
  @ApiOperation({ summary: 'Pending casual question about a recent listening report, if any' })
  spotCheck(@CurrentStudent() student: Student): ReturnType<SpotCheckGraderService['pending']> {
    return this.spotChecks.pending(student, new Date());
  }

  @Post('spot-check/answer')
  @ApiOperation({
    summary: 'Answer it (null = "I do not remember"); the verdict is never returned',
  })
  async answerSpotCheck(
    @CurrentStudent() student: Student,
    @Body() dto: SpotCheckAnswerDto,
  ): Promise<Record<string, unknown>> {
    await this.spotChecks.answer(student, dto.answer?.trim() || null, new Date());
    return { ok: true };
  }
}
