import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReportsService } from '../../domain/reports/reports.service';
import { Student } from '../../domain/students/student.entity';
import { StudentsService } from '../../domain/students/students.service';
import { StudentDetailBuilderService } from '../report-builder/student-detail-builder.service';
import { WeeklyReportBuilderService } from '../report-builder/weekly-report-builder.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { ToolsGuard } from './tools.guard';
import { ToolsService } from './tools.service';

type CronName = 'morning' | 'evening' | 'finalize' | 'weekly';
type ReportWindowKind = 'rolling' | 'week';

/**
 * Demo/ops HTTP surface (Swagger at /docs). Drives the real bot flows on demand
 * so a test student receives messages and fills them in MANUALLY — including on
 * weekends, where the scheduled morning/evening crons skip (class days = Mon–Fri).
 * Report renders use a rolling window by default so live-entered data shows today.
 * Not part of the product; guard with TOOLS_KEY.
 */
@ApiTags('tools')
@UseGuards(ToolsGuard)
@Controller('tools')
export class ToolsController {
  constructor(
    private readonly students: StudentsService,
    private readonly scheduler: SchedulerService,
    private readonly reports: ReportsService,
    private readonly weekly: WeeklyReportBuilderService,
    private readonly detail: StudentDetailBuilderService,
    private readonly tools: ToolsService,
  ) {}

  private async mustStudent(telegramUserId: number): Promise<Student> {
    const s = await this.students.findByTelegramId(telegramUserId);
    if (!s) {
      throw new NotFoundException(
        `No student with telegramUserId=${telegramUserId}. Register via the group deep link first (GET /tools/groups), or GET /tools/students.`,
      );
    }
    return s;
  }

  // --- Discovery ------------------------------------------------------------

  @Get('students')
  @ApiOperation({ summary: 'List registered students (find the telegramUserId to target)' })
  async listStudents(): Promise<Array<Record<string, unknown>>> {
    const all = await this.students.findAll();
    return all.map((s) => ({
      id: s.id,
      telegramUserId: s.telegramUserId,
      fullName: s.fullName,
      username: s.username,
      chatId: s.chatId,
      state: s.state,
      bookTitle: s.bookTitle,
      dmBlocked: s.dmBlocked,
    }));
  }

  @Get('groups')
  @ApiOperation({ summary: 'Active groups + registration deep-links (for first-time onboarding)' })
  listGroups(): Promise<Array<Record<string, unknown>>> {
    return this.tools.listGroups();
  }

  // --- Drive the flows (student fills in manually in Telegram) --------------

  @Post('reset/:userId')
  @ApiOperation({ summary: 'Clean slate: wipe the test student and re-send the first registration question' })
  @ApiParam({ name: 'userId', description: 'Telegram user id of a registered test student' })
  async reset(@Param('userId', ParseIntPipe) userId: number): Promise<unknown> {
    return this.tools.resetStudent(await this.mustStudent(userId));
  }

  @Post('evening-prompt/:userId')
  @ApiOperation({ summary: 'Send the evening listening/reading Да-Нет flow (bypasses the weekday gate)' })
  @ApiParam({ name: 'userId', description: 'Telegram user id of a registered student' })
  async eveningPrompt(@Param('userId', ParseIntPipe) userId: number): Promise<unknown> {
    const student = await this.mustStudent(userId);
    await this.scheduler.promptEveningForStudent(student);
    return { ok: true, sentTo: student.fullName, next: 'Студент жмёт Да/Нет и вписывает слова в Telegram.' };
  }

  @Post('morning/:userId')
  @ApiOperation({ summary: 'Send the morning review offer (tap → typed self-check of own new words)' })
  @ApiParam({ name: 'userId', description: 'Telegram user id of a registered student' })
  async morning(@Param('userId', ParseIntPipe) userId: number): Promise<unknown> {
    const student = await this.mustStudent(userId);
    const due = await this.scheduler.sendMorningForStudent(student);
    return { ok: true, sentTo: student.fullName, due, next: 'Студент жмёт «Повторить слова» и вводит слова по-английски.' };
  }

  @Post('weekly-report')
  @ApiOperation({ summary: 'Send the weekly report now. Default window=rolling (incl. today) so live demo data shows.' })
  @ApiQuery({ name: 'window', required: false, enum: ['rolling', 'week'], description: 'rolling=last N days incl. today (default); week=last complete Mon–Fri' })
  @ApiQuery({ name: 'days', required: false, description: 'Rolling window size (default 7)' })
  @ApiQuery({ name: 'toGroups', required: false, description: 'Also post publicly in group chats (default false)' })
  async weeklyReport(
    @Query('window') window: ReportWindowKind = 'rolling',
    @Query('days') days?: string,
    @Query('toGroups') toGroups?: string,
  ): Promise<unknown> {
    const w =
      window === 'week'
        ? this.reports.weekBounds(new Date(), 'lastComplete')
        : this.reports.rollingBounds(new Date(), Number(days) || 7);
    const res = await this.scheduler.dispatchWeekly(w, {
      postToGroups: toGroups === 'true',
      guard: false,
    });
    return { ok: true, window, from: w.monday, to: w.friday, ...res };
  }

  @Post('cron/:name')
  @ApiOperation({ summary: 'Run a scheduled cron as-is (morning/evening respect the weekday gate)' })
  @ApiParam({ name: 'name', enum: ['morning', 'evening', 'finalize', 'weekly'] })
  async runCron(@Param('name') name: CronName): Promise<unknown> {
    switch (name) {
      case 'morning':
        await this.scheduler.morningCron();
        break;
      case 'evening':
        await this.scheduler.eveningPromptCron();
        break;
      case 'finalize':
        await this.scheduler.finalizeDayCron();
        break;
      case 'weekly':
        await this.scheduler.weeklyReportCron();
        break;
      default:
        throw new NotFoundException(`Unknown cron: ${name}`);
    }
    return { ok: true, ran: name };
  }

  // --- Render reports as text (no Telegram needed) --------------------------

  @Get('report/weekly/:userId')
  @ApiOperation({ summary: "Render the report grid for a student's group as text" })
  @ApiParam({ name: 'userId', description: 'Telegram user id of a registered student' })
  @ApiQuery({ name: 'window', required: false, enum: ['rolling', 'week'], description: 'rolling=last N days incl. today (default); week=class Mon–Fri' })
  @ApiQuery({ name: 'days', required: false, description: 'Rolling window size (default 7)' })
  async weeklyText(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('window') window: ReportWindowKind = 'rolling',
    @Query('days') days?: string,
  ): Promise<unknown> {
    const student = await this.mustStudent(userId);
    if (window === 'week') {
      return { window: 'week', chunks: await this.weekly.buildForGroupChat(student.chatId, 'toDate') };
    }
    const w = this.reports.rollingBounds(new Date(), Number(days) || 7);
    return {
      window: 'rolling',
      from: w.monday,
      to: w.friday,
      chunks: await this.weekly.buildForGroupChatWindow(student.chatId, w),
    };
  }

  @Get('report/student/:userId')
  @ApiOperation({ summary: 'Render the per-student detail as text (the only view that shows words)' })
  @ApiParam({ name: 'userId', description: 'Telegram user id of a registered student' })
  @ApiQuery({ name: 'window', required: false, enum: ['rolling', 'week'] })
  @ApiQuery({ name: 'days', required: false, description: 'Rolling window size (default 7)' })
  async studentText(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('window') window: ReportWindowKind = 'rolling',
    @Query('days') days?: string,
  ): Promise<unknown> {
    const student = await this.mustStudent(userId);
    if (window === 'week') {
      return { window: 'week', text: await this.detail.buildDetail(student, 'toDate') };
    }
    const w = this.reports.rollingBounds(new Date(), Number(days) || 7);
    return { window: 'rolling', from: w.monday, to: w.friday, text: await this.detail.buildForWindow(student, w) };
  }
}
