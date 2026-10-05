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
import { ClarifyDto, ListQueryDto, PatchReportDto, SubmitReportDto } from './dto';
import { reportView, weekView } from './serializers';

function intakeView(r: IntakeResult): Record<string, unknown> {
  if (r.status === 'CLARIFY')
    return {
      status: r.status,
      draftId: r.draftId,
      missingFields: r.missingFields,
      question: r.question,
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

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Submit free text → SAVED or CLARIFY (one question); 409 DAILY_LIMIT' })
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
