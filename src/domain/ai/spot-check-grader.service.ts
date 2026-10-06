import type Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/config.service';
import { AiPurpose } from '../ai-log/ai-usage.entity';
import { SpotCheckVerdict } from '../flags/flag.enums';
import { FlagsService } from '../flags/flags.service';
import { ReportsService } from '../reports/reports.service';
import { Student } from '../students/student.entity';
import { StudentsService } from '../students/students.service';
import { LLM_PORT, LlmPort } from './llm.port';
import {
  SPOT_CHECK_SYSTEM_PROMPT,
  SPOT_CHECK_TOOL,
  SPOT_CHECK_TOOL_NAME,
} from './spot-check.prompt';
import { UsageService } from './usage.service';

/**
 * Grades the answer to a spot-check question shown in the Mini App (there is
 * no conversation to weave it into any more). Anything but OK is a quiet flag.
 */
@Injectable()
export class SpotCheckGraderService {
  private readonly logger = new Logger(SpotCheckGraderService.name);

  constructor(
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    private readonly usage: UsageService,
    private readonly flags: FlagsService,
    private readonly reports: ReportsService,
    private readonly students: StudentsService,
    private readonly config: AppConfigService,
  ) {}

  /** Pending question for the student, if any; expired ones are closed as NO_ANSWER. */
  async pending(
    student: Student,
    now: Date,
  ): Promise<{ id: string; question: string; sourceTitle: string | null } | null> {
    const id = student.dialogState.pendingSpotCheckId;
    if (!id) return null;
    const check = await this.flags.findSpotCheck(id);
    if (!check || check.answeredAt !== null) {
      await this.students.patchDialogState(student, { pendingSpotCheckId: undefined });
      return null;
    }
    if (check.askedAt === null) await this.flags.markSpotCheckAsked(check.id, now);
    const report = await this.reports.findById(check.reportId);
    return { id: check.id, question: check.question, sourceTitle: report?.sourceTitle ?? null };
  }

  /** `answer` null = "I don't remember". The verdict is never shown to the student. */
  async answer(student: Student, answer: string | null, now: Date): Promise<void> {
    const id = student.dialogState.pendingSpotCheckId;
    if (!id) return;
    const check = await this.flags.findSpotCheck(id);
    if (!check || check.answeredAt !== null) {
      await this.students.patchDialogState(student, { pendingSpotCheckId: undefined });
      return;
    }
    const verdict =
      answer === null
        ? SpotCheckVerdict.NO_ANSWER
        : await this.grade(student, check.reportId, check.question, answer);
    await this.flags.answerSpotCheck(check.id, answer, verdict, now);
    await this.students.patchDialogState(student, { pendingSpotCheckId: undefined });
  }

  private async grade(
    student: Student,
    reportId: string,
    question: string,
    answer: string,
  ): Promise<SpotCheckVerdict> {
    const report = await this.reports.findById(reportId);
    const model = this.config.aiModelAuthenticity;
    try {
      const response = await this.llm.complete({
        model,
        maxTokens: 200,
        system: [
          { type: 'text', text: SPOT_CHECK_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        tools: [SPOT_CHECK_TOOL],
        toolChoice: { type: 'tool', name: SPOT_CHECK_TOOL_NAME },
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              retelling: report?.summary ?? null,
              sourceTitle: report?.sourceTitle ?? null,
              question,
              answer,
            }),
          },
        ],
      });
      await this.usage.record(student.id, AiPurpose.AUTHENTICITY, model, response.usage);
      const call = response.content.find(
        (b): b is Anthropic.ToolUseBlock =>
          b.type === 'tool_use' && b.name === SPOT_CHECK_TOOL_NAME,
      );
      const verdict = (call?.input as { verdict?: string } | undefined)?.verdict;
      return verdict === SpotCheckVerdict.OK || verdict === SpotCheckVerdict.WRONG
        ? verdict
        : SpotCheckVerdict.VAGUE;
    } catch (err) {
      // The student already got "thanks"; a grading failure must not surface. Treat as unknown.
      this.logger.warn(`spot check grading failed for ${student.id}: ${(err as Error).message}`);
      return SpotCheckVerdict.VAGUE;
    }
  }
}
