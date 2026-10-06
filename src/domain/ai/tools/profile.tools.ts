import { Injectable } from '@nestjs/common';
import { globalConfig } from '../../../config/global.config';
import { GroupsService } from '../../groups/groups.service';
import { listeningMethodFor, requiresRetelling } from '../../groups/level';
import { LEVEL_LABELS } from '../../groups/messages';
import { ReminderChannel, ReminderKind } from '../../norms/reminder-log.entity';
import { RemindersService } from '../../norms/reminders.service';
import { displayNameOf } from '../../students/name-validation';
import { StudentsService } from '../../students/students.service';
import { AgentTool, ToolContext, ToolResult } from '../tool';

@Injectable()
export class GetProfileTool implements AgentTool {
  name = 'get_profile';
  description =
    'Профиль студента: имя, уровень, группы, методика аудирования, недельные нормы. Вызывай, когда студент спрашивает о себе, своём уровне или правилах.';
  inputSchema = {
    type: 'object' as const,
    properties: {},
    required: [],
    additionalProperties: false,
  };

  constructor(
    private readonly students: StudentsService,
    private readonly groups: GroupsService,
  ) {}

  async handle(_input: Record<string, never>, ctx: ToolContext): Promise<ToolResult> {
    const ids = await this.students.memberGroupIds(ctx.student.id);
    const groups = await Promise.all(ids.map((id) => this.groups.findById(id)));
    return {
      data: {
        name: displayNameOf(ctx.student),
        level: ctx.student.level ? LEVEL_LABELS[ctx.student.level] : null,
        groups: groups.filter((g) => g !== null).map((g) => g.title),
        listeningMethod: listeningMethodFor(ctx.student.level),
        norms: {
          readingReportsPerWeek: globalConfig.norms.readingPerWeek,
          listeningReportsPerWeek: globalConfig.norms.listeningPerWeek,
          cardsPerDay: globalConfig.norms.cardsPerDay,
        },
      },
    };
  }
}

@Injectable()
export class GetListeningMethodTool implements AgentTool {
  name = 'get_listening_method';
  description =
    'Пошаговая методика аудирования для уровня студента и что должен содержать отчёт. Вызывай на вопросы «как слушать», «как делать аудирование», «что писать в отчёте».';
  inputSchema = {
    type: 'object' as const,
    properties: {},
    required: [],
    additionalProperties: false,
  };

  async handle(_input: Record<string, never>, ctx: ToolContext): Promise<ToolResult> {
    const method = listeningMethodFor(ctx.student.level);
    return {
      data: {
        method,
        retellingRequired: requiresRetelling(method),
        reportMustInclude: requiresRetelling(method)
          ? [
              'название подкаста/сериала и эпизод',
              '% понимания с первого раза',
              'краткий пересказ своими словами (2–3 предложения)',
              'сколько раз слушал',
              'новые слова',
            ]
          : [
              'название подкаста',
              '% понимания после 1-го и 2-го прослушивания',
              'сколько раз слушал',
              'непонятные места',
              'новые слова и фразы',
            ],
      },
    };
  }
}

interface SetMoodInput {
  state: 'TIRED' | 'OK';
}

@Injectable()
export class SetMoodTool implements AgentTool<SetMoodInput> {
  name = 'set_mood';
  description =
    'Отметить, что студент устал, загружен или болеет (TIRED) — напоминания станут мягче и реже на несколько дней; или что всё снова в порядке (OK). Норма не меняется.';
  inputSchema = {
    type: 'object' as const,
    properties: { state: { type: 'string', enum: ['TIRED', 'OK'] } },
    required: ['state'],
    additionalProperties: false,
  };

  constructor(private readonly students: StudentsService) {}

  async handle(input: SetMoodInput, ctx: ToolContext): Promise<ToolResult> {
    const tiredUntil =
      input.state === 'TIRED'
        ? new Date(ctx.now.getTime() + globalConfig.reminders.tiredDays * 86_400_000).toISOString()
        : undefined;
    await this.students.patchDialogState(ctx.student, { tiredUntil });
    return { data: { state: input.state, tiredUntil: tiredUntil ?? null } };
  }
}

interface MarkReminderInput {
  kind: ReminderKind;
}

@Injectable()
export class MarkReminderWovenTool implements AgentTool<MarkReminderInput> {
  name = 'mark_reminder_woven';
  description =
    'Зафиксировать, что ты уже вплёл в ответ напоминание о невыполненной норме (READING, LISTENING или CARDS). После этого сегодня о ней больше не напоминать.';
  inputSchema = {
    type: 'object' as const,
    properties: { kind: { type: 'string', enum: Object.values(ReminderKind) } },
    required: ['kind'],
    additionalProperties: false,
  };

  constructor(private readonly reminders: RemindersService) {}

  async handle(input: MarkReminderInput, ctx: ToolContext): Promise<ToolResult> {
    await this.reminders.mark(
      ctx.student.id,
      input.kind,
      ReminderChannel.WOVEN,
      ctx.now,
      ctx.timeZone,
    );
    return { data: { marked: input.kind } };
  }
}
