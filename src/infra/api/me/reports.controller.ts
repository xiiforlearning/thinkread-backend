import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../../common/codes';
import { AppError } from '../../../common/errors';
import { AppConfigService } from '../../../config/config.service';
import { IntakeResult, ReportIntakeService } from '../../../domain/ai/report-intake.service';
import { ReportType } from '../../../domain/reports/report.entity';
import { ReportsService } from '../../../domain/reports/reports.service';
import { Student } from '../../../domain/students/student.entity';
import { JwtAuthGuard, StudentGuard } from '../auth/guards';
import { CurrentStudent } from '../auth/principal';
import { ClarifyDto, ConfirmReportDto, ListQueryDto, PatchReportDto, SubmitReportDto } from './dto';
import { reportView, weekView } from './serializers';

function intakeView(r: IntakeResult): Record<string, unknown> {
  if (r.status === 'CLARIFY')
    return {
      status: r.status,
      draftId: r.draftId,
      missingFields: r.missingFields,
      question: r.question,
    };
  if (r.status === 'CONFIRM_WORDS')
    return {
      status: r.status,
      draftId: r.draftId,
      type: r.type,
      hasList: r.hasList,
      words: r.words,
      dropped: r.dropped,
      minWords: r.minWords,
      maxWords: r.maxWords,
    };
  return {
    status: r.status,
    report: reportView(r.report),
    weekProgress: weekView(r.weekProgress),
    words: r.words,
  };
}

@ApiTags('me · reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('me/reports')
export class MeReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly intake: ReportIntakeService,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Report history, newest first; cursor = createdAt of the last item' })
  async list(
    @CurrentStudent() student: Student,
    @Query() q: ListQueryDto,
  ): Promise<{ data: unknown[]; meta: { nextCursor: string | null } }> {
    const limit = q.limit ?? 20;
    const before = q.cursor ? new Date(q.cursor) : undefined;
    const rows = await this.reports.history(student.id, limit, before);
    const nextCursor = rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null;
    return { data: rows.map(reportView), meta: { nextCursor } };
  }

  @Get('today')
  @ApiOperation({
    summary: 'Which report types were already handed in today (one per type per day)',
  })
  async today(@CurrentStudent() student: Student): Promise<Record<string, boolean>> {
    const now = new Date();
    const [reading, listening] = await Promise.all([
      this.reports.dailyLimitReached(student.id, ReportType.READING, now, this.config.timezone),
      this.reports.dailyLimitReached(student.id, ReportType.LISTENING, now, this.config.timezone),
    ]);
    return { READING: reading, LISTENING: listening };
  }

  @Get('draft')
  @ApiOperation({
    summary: 'The report in progress (CLARIFY or CONFIRM_WORDS) to resume after a reload, or null',
  })
  draft(@CurrentStudent() student: Student): Record<string, unknown> | null {
    const current = this.intake.current(student, new Date());
    return current ? intakeView(current) : null;
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Submit free text → CLARIFY (one question) or CONFIRM_WORDS (the list to confirm); 409 DAILY_LIMIT',
  })
  async submit(
    @CurrentStudent() student: Student,
    @Body() dto: SubmitReportDto,
  ): Promise<Record<string, unknown>> {
    return intakeView(
      await this.intake.submit(student, dto.type, dto.text, new Date(), this.config.timezone),
    );
  }

  @Post(':draftId/clarify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Answer the clarification question for a draft' })
  async clarify(
    @CurrentStudent() student: Student,
    @Param('draftId', ParseUUIDPipe) draftId: string,
    @Body() dto: ClarifyDto,
  ): Promise<Record<string, unknown>> {
    return intakeView(
      await this.intake.clarify(student, draftId, dto.text, new Date(), this.config.timezone),
    );
  }

  @Post(':draftId/confirm')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Confirm the word list → the report is saved and counted (SAVED); 409 WORDS_REQUIRED below the minimum',
  })
  async confirm(
    @CurrentStudent() student: Student,
    @Param('draftId', ParseUUIDPipe) draftId: string,
    @Body() dto: ConfirmReportDto,
  ): Promise<Record<string, unknown>> {
    const words = dto.words?.map((w) => ({ word: w.word, translation: w.translation ?? null }));
    return intakeView(
      await this.intake.confirm(student, draftId, words, new Date(), this.config.timezone),
    );
  }

  @Post(':draftId/discard')
  @ApiOperation({ summary: 'Back to the report: drop the draft, nothing is counted' })
  async discard(
    @CurrentStudent() student: Student,
    @Param('draftId', ParseUUIDPipe) draftId: string,
  ): Promise<{ ok: true }> {
    await this.intake.discard(student, draftId);
    return { ok: true };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Correct parsed fields of a report saved today' })
  async patch(
    @CurrentStudent() student: Student,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchReportDto,
  ): Promise<Record<string, unknown>> {
    const report = await this.reports.findById(id);
    if (!report || report.studentId !== student.id) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.REPORTS,
        error: ErrorCode.NOT_FOUND,
        meta: { id },
      });
    }
    return reportView(await this.reports.updateFields(report, dto));
  }
}
