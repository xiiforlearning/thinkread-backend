import type Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/config.service';
import { globalConfig } from '../../config/global.config';
import { AiPurpose } from '../ai-log/ai-usage.entity';
import { FlagKind } from '../flags/flag.enums';
import { FlagsService } from '../flags/flags.service';
import { LEVEL_LABELS } from '../groups/messages';
import { requiresRetelling } from '../groups/level';
import { Report, ReportType } from '../reports/report.entity';
import { ReportsService } from '../reports/reports.service';
import { Student } from '../students/student.entity';
import { StudentsService } from '../students/students.service';
import {
  AI_FLAG_KINDS,
  AUTHENTICITY_SYSTEM_PROMPT,
  AuthenticityVerdict,
  VERDICT_TOOL,
  VERDICT_TOOL_NAME,
} from './authenticity.prompt';
import { LLM_PORT, LlmPort } from './llm.port';
import { UsageService } from './usage.service';

/**
 * Background check of a freshly saved report. Deterministic signals first
 * (forwarded message, comprehension jump), then one structured model call for
 * the style signals; a suspicious verdict becomes quiet flags. For
 * no-transcript listening reports it may also plant a spot-check question for
 * the next conversation. Failures are logged and never reach the student.
 */
@Injectable()
export class AuthenticityService {
  private readonly logger = new Logger(AuthenticityService.name);
  /** Injectable randomness for tests. */
  random: () => number = Math.random;

  constructor(
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    private readonly usage: UsageService,
    private readonly reports: ReportsService,
    private readonly flags: FlagsService,
    private readonly students: StudentsService,
    private readonly config: AppConfigService,
  ) {}

  /** Fire-and-forget: the student's reply must not wait for this. */
  checkLater(report: Report, student: Student): void {
    void this.check(report, student).catch((err: Error) => {
      this.logger.warn(`authenticity check failed for report ${report.id}: ${err.message}`);
    });
  }

  async check(report: Report, student: Student): Promise<void> {
    const previous = await this.reports.recent(
      student.id,
      report.type,
      globalConfig.ai.authenticityHistory,
      report.id,
    );

    if (report.isForwarded) {
      await this.raise(report, FlagKind.FORWARDED, 'Отчёт пришёл пересланным сообщением.');
    }
    const jump = this.pctJump(report, previous);
    if (jump !== null) {
      await this.raise(
        report,
        FlagKind.PCT_JUMP,
        `Понимание с первого раза ${report.firstPassPct}% при среднем ${jump}% в предыдущих отчётах.`,
      );
    }

    const verdict = await this.askModel(report, previous, student);
    if (verdict.suspicious) {
      const kinds = verdict.kinds.filter((k) => (AI_FLAG_KINDS as readonly string[]).includes(k));
      for (const kind of kinds) await this.raise(report, kind, verdict.reason);
      if (kinds.length === 0) {
        await this.raise(report, FlagKind.TOO_POLISHED, verdict.reason);
      }
    }

    await this.maybePlantSpotCheck(report, student, verdict.spot_check_question);
  }

  /** Average first-pass % of previous listening reports, if this one jumps above it. */
  private pctJump(report: Report, previous: Report[]): number | null {
    if (report.type !== ReportType.LISTENING || report.firstPassPct === null) return null;
    const known = previous.map((r) => r.firstPassPct).filter((p): p is number => p !== null);
    if (known.length < 2) return null;
    const avg = Math.round(known.reduce((a, b) => a + b, 0) / known.length);
    return report.firstPassPct - avg >= globalConfig.ai.pctJumpThreshold ? avg : null;
  }

  private async askModel(
    report: Report,
    previous: Report[],
    student: Student,
  ): Promise<AuthenticityVerdict> {
    const model = this.config.aiModelAuthenticity;
    const response = await this.llm.complete({
      model,
      maxTokens: 400,
      system: [
        { type: 'text', text: AUTHENTICITY_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [VERDICT_TOOL],
      toolChoice: { type: 'tool', name: VERDICT_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: JSON.stringify(
            {
              level: student.level ? LEVEL_LABELS[student.level] : 'не задан',
              type: report.type,
              method: report.method,
              retellingRequired:
                report.type === ReportType.LISTENING && report.method !== null
                  ? requiresRetelling(report.method)
                  : false,
              report: this.summarize(report),
              previous: previous.map((r) => this.summarize(r)),
            },
            null,
            1,
          ),
        },
      ],
    });
    await this.usage.record(student.id, AiPurpose.AUTHENTICITY, model, response.usage);

    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === VERDICT_TOOL_NAME,
    );
    if (!call) {
      this.logger.warn(`authenticity: no verdict for report ${report.id}`);
      return { suspicious: false, kinds: [], reason: '', spot_check_question: null };
    }
    return call.input as AuthenticityVerdict;
  }

  private summarize(r: Report): Record<string, unknown> {
    return {
      date: r.createdAt?.toISOString().slice(0, 10),
      title: r.sourceTitle,
      episode: r.episode,
      pages: r.pages,
      firstPassPct: r.firstPassPct,
      secondPassPct: r.secondPassPct,
      listenCount: r.listenCount,
      summary: r.summary,
      unclear: r.unclearParts,
      text: r.rawText,
    };
  }

  private async maybePlantSpotCheck(
    report: Report,
    student: Student,
    question: string | null,
  ): Promise<void> {
    if (!question || report.type !== ReportType.LISTENING) return;
    if (report.method === null || !requiresRetelling(report.method)) return;
    if (student.dialogState.pendingSpotCheckId) return;
    if (this.random() >= globalConfig.ai.spotCheckProbability) return;

    const check = await this.flags.createSpotCheck(student.id, report.id, question.trim());
    await this.students.patchDialogState(student, { pendingSpotCheckId: check.id });
  }

  private raise(report: Report, kind: FlagKind, reason: string): Promise<unknown> {
    return this.flags.raise({ studentId: report.studentId, reportId: report.id, kind, reason });
  }
}
