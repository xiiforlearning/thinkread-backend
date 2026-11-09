import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../../common/codes';
import { AppError } from '../../../common/errors';
import { AdminRole } from '../../../domain/admins/admin.entity';
import { kindsOf } from '../../../domain/flags/flags.service';
import { FlagsService } from '../../../domain/flags/flags.service';
import { ReportsService } from '../../../domain/reports/reports.service';
import { WordsService } from '../../../domain/words/words.service';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentPrincipal, Principal, Roles } from '../auth/principal';
import { reportView, wordView } from '../me/serializers';
import { AdminScopeService } from './scope';

/** D7: any report of a visible student can be opened in full — text, words, parse, flags. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(AdminRole.OWNER, AdminRole.TEACHER)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(
    private readonly scope: AdminScopeService,
    private readonly reports: ReportsService,
    private readonly words: WordsService,
    private readonly flags: FlagsService,
  ) {}

  @Get(':id')
  @ApiOperation({
    summary: 'One report in full: raw text, the words it added, the parse, its flags',
  })
  async one(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    const scope = await this.scope.resolve(principal);
    const report = await this.reports.findById(id);
    if (!report) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.REPORTS,
        error: ErrorCode.NOT_FOUND,
        meta: { id },
      });
    }
    // Visibility is the student's: a teacher sees only the reports of their groups.
    await this.scope.student(scope, report.studentId);
    const [words, flags] = await Promise.all([
      this.words.bySourceReport(report.id),
      this.flags.byReport(report.id),
    ]);
    return {
      ...reportView(report),
      rawText: report.rawText,
      isForwarded: report.isForwarded,
      slot: report.slot,
      parsed: report.parsed,
      aiMetrics: report.aiMetrics,
      words: words.map(wordView),
      flags: flags.map((f) => ({ id: f.id, status: f.status, kinds: kindsOf(f) })),
    };
  }
}
