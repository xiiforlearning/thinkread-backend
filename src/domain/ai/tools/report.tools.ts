import { Injectable } from '@nestjs/common';
import { globalConfig } from '../../../config/global.config';
import { SpotCheckVerdict } from '../../flags/flag.enums';
import { FlagsService } from '../../flags/flags.service';
import { listeningMethodFor } from '../../groups/level';
import {
  ListeningReportInput,
  MIN_RETELLING_CHARS,
  missingListeningFields,
  requiredListeningFields,
} from '../../reports/listening-fields';
import { Report, ReportType } from '../../reports/report.entity';
import { ReportOrigin, ReportsService, WeekProgress } from '../../reports/reports.service';
import { StudentsService } from '../../students/students.service';
import { AuthenticityService } from '../authenticity.service';
import { AgentTool, ToolContext, ToolResult } from '../tool';

/** Short enough to be a title, not a description. */
const MIN_SUMMARY_CHARS = 20;

function origin(ctx: ToolContext): ReportOrigin {
  return {
    now: ctx.now,
    timeZone: ctx.timeZone,
    rawText: ctx.message.text,
    forwarded: ctx.message.forwarded,
  };
}

function progressData(p: WeekProgress): Record<string, unknown> {
  return {
    reading: `${p.reading}/${p.readingNorm}`,
    listening: `${p.listening}/${p.listeningNorm}`,
    readingDone: p.reading >= p.readingNorm,
    listeningDone: p.listening >= p.listeningNorm,
  };
}

/** The second report of a type on one day is not saved (customer's rule; also caps token spend). */
function dailyLimitData(type: ReportType, progress: WeekProgress): ToolResult {
  return {
    data: {
      saved: false,
      reason: 'DAILY_LIMIT',
      weekProgress: progressData(progress),
      hint:
        type === ReportType.READING
          ? 'Сегодня отчёт о чтении уже засчитан — не больше одного в день. Скажи это студенту дружелюбно: следующий можно сдать завтра, а сегодня можно сдать аудирование или повторить слова.'
          : 'Сегодня отчёт об аудировании уже засчитан — не больше одного в день. Скажи это студенту дружелюбно: следующий можно сдать завтра, а сегодня можно сдать чтение или повторить слова.',
    },
  };
}

function savedData(report: Report, progress: WeekProgress, newWords: string[]): ToolResult {
  return {
    data: {
      saved: true,
      reportId: report.id,
      weekProgress: progressData(progress),
      // Vocabulary tools arrive with the next stage; be honest with the student.
      newWordsNoted: newWords.length,
      note:
        newWords.length > 0
          ? 'Слова записаны в отчёт; добавление в личный словарь пока в разработке.'
          : undefined,
    },
  };
}

interface ReadingInput {
  book_title: string;
  pages: number | null;
  summary: string;
  new_words: string[];
}

@Injectable()
export class SaveReadingReportTool implements AgentTool<ReadingInput> {
  name = 'save_reading_report';
  description =
    'Сохранить отчёт о чтении: название книги, сколько страниц прочитано, о чём прочитанное (2–3 предложения), новые слова. Вызывай только когда студент реально описал прочитанное; ничего не выдумывай — если названия или описания нет, сначала спроси. Не больше одного отчёта о чтении в день: при повторе вернёт reason DAILY_LIMIT. Возвращает прогресс недельной нормы.';
  inputSchema = {
    type: 'object' as const,
    properties: {
      book_title: { type: 'string', description: 'Название книги (и автор, если назван)' },
      pages: {
        type: ['integer', 'null'],
        description: 'Сколько страниц прочитано; null если не сказано',
      },
      summary: {
        type: 'string',
        description: 'О чём прочитанное — своими словами студента, 2–3 предложения',
      },
      new_words: {
        type: 'array',
        items: { type: 'string' },
        description: 'Новые слова из текста, по одному',
      },
    },
    required: ['book_title', 'pages', 'summary', 'new_words'],
    additionalProperties: false,
  };

  constructor(
    private readonly reports: ReportsService,
    private readonly authenticity: AuthenticityService,
  ) {}

  async handle(input: ReadingInput, ctx: ToolContext): Promise<ToolResult> {
    if (
      await this.reports.dailyLimitReached(
        ctx.student.id,
        ReportType.READING,
        ctx.now,
        ctx.timeZone,
      )
    ) {
      const progress = await this.reports.weekProgress(ctx.student.id, ctx.now, ctx.timeZone);
      return dailyLimitData(ReportType.READING, progress);
    }
    const missing: string[] = [];
    if (input.book_title.trim().length === 0) missing.push('book_title');
    if (input.summary.trim().length < MIN_SUMMARY_CHARS) missing.push('summary');
    if (missing.length > 0) {
      return {
        data: {
          saved: false,
          missing_fields: missing,
          hint: 'Спроси у студента недостающее одним сообщением, затем сохрани.',
        },
      };
    }
    const report = await this.reports.saveReading(
      ctx.student,
      {
        bookTitle: input.book_title,
        pages: input.pages,
        summary: input.summary,
        newWords: input.new_words,
      },
      origin(ctx),
    );
    this.authenticity.checkLater(report, ctx.student);
    const progress = await this.reports.weekProgress(ctx.student.id, ctx.now, ctx.timeZone);
    return savedData(report, progress, input.new_words);
  }
}

interface ListeningInput {
  source_title: string | null;
  episode: string | null;
  first_pass_pct: number | null;
  second_pass_pct: number | null;
  listen_count: number | null;
  retelling: string | null;
  unclear_parts: string[];
  new_words: string[];
}

@Injectable()
export class SaveListeningReportTool implements AgentTool<ListeningInput> {
  name = 'save_listening_report';
  description =
    'Сохранить отчёт об аудировании (подкаст, сериал). Передавай всё, что студент сообщил; чего нет — null. Инструмент проверит обязательные поля по методике уровня и, если чего-то не хватает, вернёт missing_fields — тогда спроси именно это и вызови снова. Пересказ (retelling) обязателен для уровней без транскрипта. Ничего не выдумывай. Не больше одного отчёта об аудировании в день: при повторе вернёт reason DAILY_LIMIT.';
  inputSchema = {
    type: 'object' as const,
    properties: {
      source_title: { type: ['string', 'null'], description: 'Подкаст / сериал' },
      episode: { type: ['string', 'null'], description: 'Эпизод, серия или сцена' },
      first_pass_pct: {
        type: ['integer', 'null'],
        description: '% понимания с первого прослушивания, 0–100',
      },
      second_pass_pct: {
        type: ['integer', 'null'],
        description: '% понимания после повторного прослушивания, 0–100',
      },
      listen_count: { type: ['integer', 'null'], description: 'Сколько раз слушал/смотрел' },
      retelling: {
        type: ['string', 'null'],
        description:
          'Пересказ содержания своими словами студента (на любом языке), дословно как он написал',
      },
      unclear_parts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Что осталось непонятным',
      },
      new_words: { type: 'array', items: { type: 'string' }, description: 'Новые слова и фразы' },
    },
    required: [
      'source_title',
      'episode',
      'first_pass_pct',
      'second_pass_pct',
      'listen_count',
      'retelling',
      'unclear_parts',
      'new_words',
    ],
    additionalProperties: false,
  };

  constructor(
    private readonly reports: ReportsService,
    private readonly authenticity: AuthenticityService,
  ) {}

  async handle(input: ListeningInput, ctx: ToolContext): Promise<ToolResult> {
    if (
      await this.reports.dailyLimitReached(
        ctx.student.id,
        ReportType.LISTENING,
        ctx.now,
        ctx.timeZone,
      )
    ) {
      const progress = await this.reports.weekProgress(ctx.student.id, ctx.now, ctx.timeZone);
      return dailyLimitData(ReportType.LISTENING, progress);
    }
    const method = listeningMethodFor(ctx.student.level);
    const parsed: ListeningReportInput = {
      sourceTitle: input.source_title,
      episode: input.episode,
      firstPassPct: input.first_pass_pct,
      secondPassPct: input.second_pass_pct,
      listenCount: input.listen_count,
      retelling: input.retelling,
      unclearParts: input.unclear_parts,
      newWords: input.new_words,
    };
    const missing = missingListeningFields(method, parsed);
    if (missing.length > 0) {
      return {
        data: {
          saved: false,
          method,
          required: requiredListeningFields(method),
          missing_fields: missing,
          hint: missing.includes('retelling')
            ? `Нужен пересказ своими словами, 2–3 предложения (не короче ${MIN_RETELLING_CHARS} символов). Спроси недостающее одним сообщением.`
            : 'Спроси у студента недостающее одним сообщением, затем сохрани.',
        },
      };
    }
    const report = await this.reports.saveListening(ctx.student, parsed, origin(ctx));
    this.authenticity.checkLater(report, ctx.student);
    const progress = await this.reports.weekProgress(ctx.student.id, ctx.now, ctx.timeZone);
    return savedData(report, progress, input.new_words);
  }
}

@Injectable()
export class GetProgressTool implements AgentTool {
  name = 'get_progress';
  description =
    'Прогресс студента за текущую неделю: сколько отчётов о чтении и аудировании сдано из нормы. Вызывай на вопросы «как у меня дела», «сколько отчётов осталось», «выполнил ли норму».';
  inputSchema = {
    type: 'object' as const,
    properties: {},
    required: [],
    additionalProperties: false,
  };

  constructor(private readonly reports: ReportsService) {}

  async handle(_input: Record<string, never>, ctx: ToolContext): Promise<ToolResult> {
    const progress = await this.reports.weekProgress(ctx.student.id, ctx.now, ctx.timeZone);
    return {
      data: {
        weekStart: progress.weekStart,
        ...progressData(progress),
        cardsPerDayNorm: globalConfig.norms.cardsPerDay,
        cardsToday: null,
        note: 'Карточки пока в разработке — статистика по ним появится позже.',
      },
    };
  }
}

interface SpotCheckAnswerInput {
  answer: string;
  verdict: SpotCheckVerdict;
}

@Injectable()
export class RecordSpotCheckAnswerTool implements AgentTool<SpotCheckAnswerInput> {
  name = 'record_spot_check_answer';
  description =
    'Сохранить ответ студента на точечный вопрос из блока состояния и твою оценку: OK — ответил конкретно и по делу, VAGUE — ответил общими словами, WRONG — ответ не сходится с отчётом, NO_ANSWER — ушёл от ответа. Студенту оценку не сообщай, просто продолжай разговор.';
  inputSchema = {
    type: 'object' as const,
    properties: {
      answer: { type: 'string', description: 'Ответ студента дословно' },
      verdict: { type: 'string', enum: Object.values(SpotCheckVerdict) },
    },
    required: ['answer', 'verdict'],
    additionalProperties: false,
  };

  constructor(
    private readonly flags: FlagsService,
    private readonly students: StudentsService,
  ) {}

  async handle(input: SpotCheckAnswerInput, ctx: ToolContext): Promise<ToolResult> {
    const id = ctx.student.dialogState.pendingSpotCheckId;
    if (!id) return { data: { recorded: false, reason: 'no pending spot check' } };
    await this.flags.answerSpotCheck(id, input.answer, input.verdict, ctx.now);
    await this.students.patchDialogState(ctx.student, { pendingSpotCheckId: undefined });
    return { data: { recorded: true } };
  }
}
