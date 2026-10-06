import type Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { AppConfigService } from '../../config/config.service';
import { AiPurpose } from '../ai-log/ai-usage.entity';
import { Student } from '../students/student.entity';
import { LLM_PORT, LlmPort } from './llm.port';
import {
  PARENT_REPORT_SYSTEM_PROMPT,
  PARENT_REPORT_TOOL,
  PARENT_REPORT_TOOL_NAME,
} from './parent-report.prompt';
import { StudentFactsService } from './student-facts.service';
import {
  TEACHER_CHAT_SYSTEM_PROMPT,
  TEACHER_REPLY_TOOL,
  TEACHER_REPLY_TOOL_NAME,
  TeacherReply,
} from './teacher-chat.prompt';
import { UsageService } from './usage.service';

export interface ChatTurn {
  role: 'teacher' | 'ai';
  text: string;
}

const CHAT_WEEKS = 4;
const MAX_HISTORY = 10;

/**
 * The teacher's per-student AI (dashboard): one forced-tool call over a facts
 * block the system computed. The student never sees any of it. Also builds
 * the parents' report for a month (AiPurpose.PARENT_REPORT).
 */
@Injectable()
export class TeacherChatService {
  private readonly logger = new Logger(TeacherChatService.name);

  constructor(
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    private readonly usage: UsageService,
    private readonly facts: StudentFactsService,
    private readonly config: AppConfigService,
  ) {}

  async ask(
    student: Student,
    question: string,
    history: ChatTurn[] = [],
    now = new Date(),
  ): Promise<TeacherReply> {
    const facts = await this.facts.collect(student, now, { weeks: CHAT_WEEKS });
    const payload = {
      facts,
      history: history.slice(-MAX_HISTORY),
      question: question.trim(),
    };
    const input = await this.call(
      student.id,
      AiPurpose.TEACHER_CHAT,
      TEACHER_CHAT_SYSTEM_PROMPT,
      TEACHER_REPLY_TOOL,
      TEACHER_REPLY_TOOL_NAME,
      JSON.stringify(payload),
    );
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text) throw unavailable('empty reply');
    return { text, draft: input.draft === true };
  }

  /** `month` = `YYYY-MM` in the school's timezone. */
  async parentReport(
    student: Student,
    range: { from: Date; to: Date; label: string },
    now = new Date(),
  ): Promise<{ text: string }> {
    const facts = await this.facts.collect(student, now, range);
    const input = await this.call(
      student.id,
      AiPurpose.PARENT_REPORT,
      PARENT_REPORT_SYSTEM_PROMPT,
      PARENT_REPORT_TOOL,
      PARENT_REPORT_TOOL_NAME,
      JSON.stringify({ facts }),
    );
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text) throw unavailable('empty report');
    return { text };
  }

  private async call(
    studentId: string,
    purpose: AiPurpose,
    system: string,
    tool: Anthropic.Tool,
    toolName: string,
    userText: string,
  ): Promise<Record<string, unknown>> {
    const model = this.config.aiModelDialog;
    let response: Anthropic.Message;
    try {
      response = await this.llm.complete({
        model,
        maxTokens: 1024,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools: [tool],
        toolChoice: { type: 'tool', name: toolName },
        messages: [{ role: 'user', content: userText }],
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      this.logger.warn(`${purpose} failed: ${(err as Error).message}`);
      throw unavailable((err as Error).message);
    }
    await this.usage.record(studentId, purpose, model, response.usage);
    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === toolName,
    );
    if (!call) throw unavailable('no tool call');
    return call.input as Record<string, unknown>;
  }
}

function unavailable(detail: string): AppError {
  return new AppError({
    level: ErrorLevel.HIGH_INTEGRATION,
    service: ServiceCode.AI,
    error: ErrorCode.AI_UNAVAILABLE,
    message: `teacher chat: ${detail}`,
  });
}
