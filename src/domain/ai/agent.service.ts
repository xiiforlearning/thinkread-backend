import type Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { format } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { AppConfigService } from '../../config/config.service';
import { globalConfig } from '../../config/global.config';
import { AiMessageRole } from '../ai-log/ai-message.entity';
import { AiPurpose } from '../ai-log/ai-usage.entity';
import { SpotCheckVerdict } from '../flags/flag.enums';
import { FlagsService } from '../flags/flags.service';
import { listeningMethodFor } from '../groups/level';
import { RemindersService } from '../norms/reminders.service';
import { localDay } from '../norms/week';
import { ReportType } from '../reports/report.entity';
import { ReportsService } from '../reports/reports.service';
import { displayNameOf } from '../students/name-validation';
import { Student } from '../students/student.entity';
import { StudentsService } from '../students/students.service';
import { DialogHistoryService } from './dialog-history.service';
import { LLM_PORT, LlmPort } from './llm.port';
import { aiMessages } from './messages';
import { KeyedLock } from './student-lock';
import { buildStateBlock, buildSystemPrompt } from './system.prompt';
import {
  AGENT_TOOLS,
  AgentTool,
  IncomingMessage,
  ToolContext,
  ToolResult,
  toApiTool,
} from './tool';
import { UsageService } from './usage.service';

export interface AgentReply {
  text: string;
  keyboard?: ToolResult['keyboard'];
}

const WEEKDAYS = [
  'воскресенье',
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
];

/**
 * One turn of the student dialog: context → Claude → tool calls → final text.
 * Tools do the writes; the agent only orchestrates and records history/usage.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly lock = new KeyedLock();
  private readonly apiTools: Anthropic.Tool[];
  private readonly systemPrompt: string;
  private readonly toolsByName: Map<string, AgentTool>;

  constructor(
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    @Inject(AGENT_TOOLS) tools: AgentTool[],
    private readonly history: DialogHistoryService,
    private readonly usage: UsageService,
    private readonly reminders: RemindersService,
    private readonly reports: ReportsService,
    private readonly flags: FlagsService,
    private readonly students: StudentsService,
    private readonly config: AppConfigService,
  ) {
    // Deterministic order — the tool list is part of the cached prefix.
    const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
    this.toolsByName = new Map(sorted.map((t) => [t.name, t]));
    this.apiTools = sorted.map(toApiTool);
    if (this.apiTools.length > 0) {
      this.apiTools[this.apiTools.length - 1].cache_control = { type: 'ephemeral' };
    }
    this.systemPrompt = buildSystemPrompt(sorted);
  }

  /** Handle a student message. Serialized per student. */
  handle(
    student: Student,
    text: string,
    now = new Date(),
    options: { forwarded?: boolean } = {},
  ): Promise<AgentReply> {
    const message: IncomingMessage = { text, forwarded: options.forwarded ?? false };
    return this.lock.run(student.id, () => this.turn(student, message, now));
  }

  private async turn(student: Student, message: IncomingMessage, now: Date): Promise<AgentReply> {
    const timeZone = this.config.timezone;
    const text = message.text;

    if (await this.overDailyBudget(student.id, now, timeZone)) {
      this.logger.warn(`student ${student.id} over daily token budget`);
      return { text: aiMessages.budgetExceeded };
    }

    const ctx: ToolContext = { student, now, timeZone, message };
    const messages: Anthropic.MessageParam[] = [
      ...(await this.history.recent(student.id, now)),
      {
        role: 'user',
        content: [
          { type: 'text', text: await this.stateBlock(student, message, now, timeZone) },
          { type: 'text', text },
        ],
      },
    ];
    await this.history.append(student.id, AiMessageRole.USER, text);

    let keyboard: ToolResult['keyboard'];
    for (let i = 0; i <= globalConfig.ai.maxToolIterations; i += 1) {
      const response = await this.complete(student.id, messages);

      if (response.stop_reason === 'tool_use') {
        if (i === globalConfig.ai.maxToolIterations) {
          throw new AppError({
            level: ErrorLevel.MEDIUM_REPEATING,
            service: ServiceCode.AI,
            error: ErrorCode.AI_LOOP_LIMIT,
            meta: { studentId: student.id },
          });
        }
        messages.push({ role: 'assistant', content: response.content });
        const results = await this.runTools(response, ctx);
        keyboard = results.keyboard ?? keyboard;
        messages.push({ role: 'user', content: results.blocks });
        continue;
      }

      const reply = this.finalText(response);
      await this.history.append(student.id, AiMessageRole.ASSISTANT, reply);
      return { text: reply, keyboard };
    }
    // Unreachable: the loop either returns or throws.
    throw new AppError({
      level: ErrorLevel.MEDIUM_REPEATING,
      service: ServiceCode.AI,
      error: ErrorCode.UNKNOWN,
    });
  }

  private async complete(
    studentId: string,
    messages: Anthropic.MessageParam[],
  ): Promise<Anthropic.Message> {
    const model = this.config.aiModelDialog;
    const response = await this.llm.complete({
      model,
      maxTokens: 1024,
      system: [{ type: 'text', text: this.systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools: this.apiTools,
      messages,
    });
    await this.usage.record(studentId, AiPurpose.DIALOG, model, response.usage);
    if (response.usage.cache_read_input_tokens === 0 && messages.length > 1) {
      // A cold cache on a follow-up turn means something in the prefix is not stable.
      this.logger.warn(`prompt cache miss for student ${studentId}`);
    }
    return response;
  }

  private async runTools(
    response: Anthropic.Message,
    ctx: ToolContext,
  ): Promise<{ blocks: Anthropic.ToolResultBlockParam[]; keyboard?: ToolResult['keyboard'] }> {
    const calls = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    const blocks: Anthropic.ToolResultBlockParam[] = [];
    let keyboard: ToolResult['keyboard'];
    for (const call of calls) {
      const tool = this.toolsByName.get(call.name);
      if (!tool) {
        blocks.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: `Unknown tool ${call.name}`,
          is_error: true,
        });
        continue;
      }
      try {
        const result = await tool.handle(call.input as Record<string, unknown>, ctx);
        keyboard = result.keyboard ?? keyboard;
        blocks.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify(result.data),
        });
      } catch (err) {
        const message = err instanceof AppError ? err.code : (err as Error).message;
        this.logger.warn(`tool ${call.name} failed for student ${ctx.student.id}: ${message}`);
        blocks.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: `Error: ${message}`,
          is_error: true,
        });
      }
    }
    return { blocks, keyboard };
  }

  private finalText(response: Anthropic.Message): string {
    if (response.stop_reason === 'refusal') return aiMessages.cannotAnswer;
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return text.length > 0 ? text : aiMessages.cannotAnswer;
  }

  private async stateBlock(
    student: Student,
    message: IncomingMessage,
    now: Date,
    timeZone: string,
  ): Promise<string> {
    const local = toZonedTime(now, timeZone);
    const lines: string[] = [];

    const progress = await this.reports.weekProgress(student.id, now, timeZone);
    lines.push(
      `Нормы этой недели: чтение ${progress.reading}/${progress.readingNorm}, аудирование ${progress.listening}/${progress.listeningNorm}.`,
    );
    const [readToday, listenToday] = await Promise.all([
      this.reports.dailyLimitReached(student.id, ReportType.READING, now, timeZone),
      this.reports.dailyLimitReached(student.id, ReportType.LISTENING, now, timeZone),
    ]);
    if (readToday || listenToday) {
      const done = [readToday ? 'чтение' : null, listenToday ? 'аудирование' : null].filter(
        Boolean,
      );
      lines.push(
        `Сегодня уже сдано: ${done.join(', ')} — ещё один отчёт этого типа сегодня не принимается (не больше одного в день на тип). Не расспрашивай о новом отчёте того же типа, сразу скажи, что он пойдёт завтра.`,
      );
    }

    const pending = await this.reminders.pendingToday(student.id, now, timeZone);
    lines.push(
      pending.length > 0
        ? `Сегодня ещё не напоминали о: ${pending.join(', ')} (напоминать только если норма по пункту не выполнена).`
        : 'Сегодня обо всём уже напоминали — больше не напоминай.',
    );
    const tiredUntil = student.dialogState.tiredUntil;
    if (tiredUntil && new Date(tiredUntil) > now) {
      lines.push(
        `Студент недавно сказал, что устал (до ${localDay(new Date(tiredUntil), timeZone)}) — мягче и реже.`,
      );
    }
    if (message.forwarded) {
      lines.push('Это сообщение переслано из другого чата.');
    }

    const spotCheck = await this.pendingSpotCheck(student, now);
    if (spotCheck) lines.push(spotCheck);

    return buildStateBlock({
      displayName: displayNameOf(student),
      level: student.level,
      method: listeningMethodFor(student.level),
      localDate: format(local, 'yyyy-MM-dd'),
      weekday: WEEKDAYS[local.getDay()],
      lines,
    });
  }

  /**
   * The spot-check line for the state block, if one is waiting. First shown =
   * asked; one left unanswered for too long becomes NO_ANSWER and is dropped.
   */
  private async pendingSpotCheck(student: Student, now: Date): Promise<string | null> {
    const id = student.dialogState.pendingSpotCheckId;
    if (!id) return null;
    const check = await this.flags.findSpotCheck(id);
    if (!check || check.answeredAt !== null) {
      await this.students.patchDialogState(student, { pendingSpotCheckId: undefined });
      return null;
    }
    const expiry = globalConfig.ai.spotCheckExpiryDays * 86_400_000;
    if (check.askedAt !== null && now.getTime() - check.askedAt.getTime() > expiry) {
      await this.flags.answerSpotCheck(check.id, null, SpotCheckVerdict.NO_ANSWER, now);
      await this.students.patchDialogState(student, { pendingSpotCheckId: undefined });
      return null;
    }
    if (check.askedAt === null) await this.flags.markSpotCheckAsked(check.id, now);
    const report = await this.reports.findById(check.reportId);
    const about = report?.sourceTitle ? ` («${report.sourceTitle}»)` : '';
    return `Точечный вопрос по недавнему отчёту об аудировании${about}: «${check.question}». Задай его между делом, как обычное любопытство, когда это уместно (не в ответ на новый отчёт). Когда студент ответит — оцени ответ и вызови record_spot_check_answer.`;
  }

  private async overDailyBudget(studentId: string, now: Date, timeZone: string): Promise<boolean> {
    const startOfDay = fromZonedTime(`${localDay(now, timeZone)}T00:00:00`, timeZone);
    const spent = await this.usage.tokensSince(studentId, startOfDay);
    return spent >= globalConfig.ai.dailyTokenLimitPerStudent;
  }

  /** For tests and the eval script. */
  tools(): AgentTool[] {
    return [...this.toolsByName.values()];
  }

  /** Exposed so the eval script can count tokens of the stable prefix. */
  get prompt(): string {
    return this.systemPrompt;
  }
}
