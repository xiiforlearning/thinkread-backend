import { Injectable } from '@nestjs/common';
import { globalConfig } from '../../../config/global.config';
import { localDay } from '../../norms/week';
import { wordMessages } from '../../words/messages';
import { lemmaOf } from '../../words/normalize';
import { WordImportsService } from '../../words/word-imports.service';
import { WordListsService } from '../../words/word-lists.service';
import { Word } from '../../words/word.entity';
import { CefrLevel, WordPriority, WordSource, WordStatus } from '../../words/word.enums';
import { AddWordsResult, WordsService } from '../../words/words.service';
import { EnrichmentService } from '../enrichment.service';
import { AgentTool, ToolContext, ToolResult } from '../tool';

function brief(w: Word): Record<string, unknown> {
  return {
    word: w.word,
    translation: w.translation,
    cefr: w.cefr,
    status: w.status,
    stage: w.stage,
    priority: w.priority,
    source: w.source,
  };
}

function addedData(result: AddWordsResult): Record<string, unknown> {
  return {
    added: result.added.map(brief),
    alreadyHad: result.existing.map((w) => w.word),
    alreadyLearned: result.learned.map((w) => w.word),
    hint:
      result.learned.length > 0
        ? 'Слова из alreadyLearned студент уже выучил — предложи вернуть их в повторение (set_word_status LEARNING), если он хочет.'
        : undefined,
  };
}

export function importKeyboard(importId: string, toAdd: number): ToolResult['keyboard'] {
  return [
    [
      { text: wordMessages.confirmButton(toAdd), callbackData: `wimport:ok:${importId}` },
      { text: wordMessages.cancelButton, callbackData: `wimport:no:${importId}` },
    ],
  ];
}

interface AddWordsInput {
  words: Array<{ word: string; translation: string | null }>;
}

@Injectable()
export class AddWordsTool implements AgentTool<AddWordsInput> {
  name = 'add_words';
  description =
    'Добавить слова в личный словарь студента: «добавь слово X», «запиши: wand, owl», список с переводами. Перевод передавай только если студент его сам написал; иначе null — подберём автоматически. Больше 5 слов — инструмент вернёт предпросмотр с кнопками подтверждения, тогда просто перескажи сводку и попроси нажать кнопку. Слова, добавленные вручную, получают приоритет в карточках.';
  inputSchema = {
    type: 'object' as const,
    properties: {
      words: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            word: { type: 'string', description: 'Английское слово или фраза как написал студент' },
            translation: {
              type: ['string', 'null'],
              description: 'Перевод студента, если он его дал',
            },
          },
          required: ['word', 'translation'],
          additionalProperties: false,
        },
      },
    },
    required: ['words'],
    additionalProperties: false,
  };

  constructor(
    private readonly words: WordsService,
    private readonly imports: WordImportsService,
    private readonly enrichment: EnrichmentService,
  ) {}

  async handle(input: AddWordsInput, ctx: ToolContext): Promise<ToolResult> {
    const parsed = input.words
      .map((w) => ({ word: w.word.trim(), translation: w.translation?.trim() || null }))
      .filter((w) => w.word.length > 0);
    if (parsed.length === 0)
      return { data: { added: [], hint: 'Слов не найдено — уточни у студента.' } };

    if (parsed.length > globalConfig.words.bulkImportConfirmThreshold) {
      const preview = await this.imports.createPreview(ctx.student, parsed);
      return {
        data: {
          preview: true,
          importId: preview.importId,
          found: preview.found,
          duplicates: preview.duplicates,
          toAdd: preview.toAdd,
          summary: wordMessages.importPreview(preview.found, preview.duplicates, preview.toAdd),
          hint: 'Ничего ещё не добавлено. Передай сводку студенту и попроси подтвердить кнопкой под сообщением.',
        },
        keyboard: preview.toAdd > 0 ? importKeyboard(preview.importId, preview.toAdd) : undefined,
      };
    }

    const result = await this.words.addWords(ctx.student, parsed, { source: WordSource.MANUAL });
    if (result.added.length > 0) {
      // A few words: enrich now so the reply can show translations. Failures only delay enrichment.
      await this.enrichment
        .enrich(
          result.added.map((w) => w.lemma ?? lemmaOf(w.word)),
          ctx.student.id,
        )
        .catch(() => undefined);
      const fresh = await Promise.all(result.added.map((w) => this.words.findById(w.id)));
      result.added = fresh.filter((w): w is Word => w !== null);
    }
    return { data: addedData(result) };
  }
}

interface SearchInput {
  query: string | null;
  status: WordStatus | null;
  cefr: CefrLevel | null;
  source: WordSource | null;
  priority: WordPriority | null;
}

@Injectable()
export class SearchVocabularyTool implements AgentTool<SearchInput> {
  name = 'search_vocabulary';
  description =
    'Найти слова в словаре студента: «как я перевёл wand?», «какие слова из подкастов?», «что у меня на B2?», «покажи приоритетные». Все поля необязательные (null). Возвращает до 20 слов.';
  inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: ['string', 'null'], description: 'Часть слова или перевода' },
      status: { type: ['string', 'null'], enum: [...Object.values(WordStatus), null] },
      cefr: { type: ['string', 'null'], enum: [...Object.values(CefrLevel), null] },
      source: { type: ['string', 'null'], enum: [...Object.values(WordSource), null] },
      priority: { type: ['string', 'null'], enum: [...Object.values(WordPriority), null] },
    },
    required: ['query', 'status', 'cefr', 'source', 'priority'],
    additionalProperties: false,
  };

  constructor(private readonly words: WordsService) {}

  async handle(input: SearchInput, ctx: ToolContext): Promise<ToolResult> {
    const rows = await this.words.search(ctx.student.id, {
      query: input.query ?? undefined,
      status: input.status ?? undefined,
      cefr: input.cefr ?? undefined,
      source: input.source ?? undefined,
      priority: input.priority ?? undefined,
      limit: 20,
    });
    return { data: { count: rows.length, words: rows.map(brief) } };
  }
}

@Injectable()
export class GetVocabularySummaryTool implements AgentTool {
  name = 'get_vocabulary_summary';
  description =
    'Сводка словаря: сколько слов всего, изучается, выучено, приоритетных, по уровням и источникам. Вызывай на «сколько у меня слов», «как дела со словарём».';
  inputSchema = {
    type: 'object' as const,
    properties: {},
    required: [],
    additionalProperties: false,
  };

  constructor(private readonly words: WordsService) {}

  async handle(_input: Record<string, never>, ctx: ToolContext): Promise<ToolResult> {
    const summary = await this.words.summary(ctx.student.id);
    return {
      data: { ...summary, note: 'Полный словарь с поиском и фильтрами — в приложении (Mini App).' },
    };
  }
}

interface SetStatusInput {
  word: string;
  status: WordStatus;
}

@Injectable()
export class SetWordStatusTool implements AgentTool<SetStatusInput> {
  name = 'set_word_status';
  description =
    'Отметить слово выученным («это я уже знаю» → LEARNED, оно уйдёт из карточек) или вернуть в повторение («верни wand в повторение» → LEARNING).';
  inputSchema = {
    type: 'object' as const,
    properties: {
      word: { type: 'string' },
      status: { type: 'string', enum: Object.values(WordStatus) },
    },
    required: ['word', 'status'],
    additionalProperties: false,
  };

  constructor(private readonly words: WordsService) {}

  async handle(input: SetStatusInput, ctx: ToolContext): Promise<ToolResult> {
    const word = await this.words.findByWord(ctx.student.id, input.word);
    if (!word) return { data: { updated: false, reason: 'not in vocabulary', word: input.word } };
    const updated = await this.words.setStatus(word, input.status);
    return { data: { updated: true, ...brief(updated) } };
  }
}

interface SetPriorityInput {
  word: string;
  priority: WordPriority;
}

@Injectable()
export class SetWordPriorityTool implements AgentTool<SetPriorityInput> {
  name = 'set_word_priority';
  description =
    'Приоритет слова в карточках: HIGH — «это важное слово», «повторяй чаще» (идёт сразу после просроченных); NORMAL — обычная очередь. Интервалы и стадии не меняет.';
  inputSchema = {
    type: 'object' as const,
    properties: {
      word: { type: 'string' },
      priority: { type: 'string', enum: Object.values(WordPriority) },
    },
    required: ['word', 'priority'],
    additionalProperties: false,
  };

  constructor(private readonly words: WordsService) {}

  async handle(input: SetPriorityInput, ctx: ToolContext): Promise<ToolResult> {
    const word = await this.words.findByWord(ctx.student.id, input.word);
    if (!word) return { data: { updated: false, reason: 'not in vocabulary', word: input.word } };
    const updated = await this.words.setPriority(word, input.priority);
    return { data: { updated: true, ...brief(updated) } };
  }
}

interface ExportInput {
  format: 'csv' | 'txt';
}

@Injectable()
export class ExportVocabularyTool implements AgentTool<ExportInput> {
  name = 'export_vocabulary';
  description =
    'Отправить студенту файл со всем словарём: csv (слово; перевод; пример; уровень; статус; стадия; источник; дата) или txt (слово — перевод). Файл уйдёт вместе с твоим ответом.';
  inputSchema = {
    type: 'object' as const,
    properties: { format: { type: 'string', enum: ['csv', 'txt'] } },
    required: ['format'],
    additionalProperties: false,
  };

  constructor(private readonly words: WordsService) {}

  async handle(input: ExportInput, ctx: ToolContext): Promise<ToolResult> {
    const content = await this.words.exportText(ctx.student.id, input.format);
    const filename = wordMessages.exportFilename(input.format, localDay(ctx.now, ctx.timeZone));
    return {
      data: { file: filename, format: input.format },
      document: { filename, content, mime: input.format === 'csv' ? 'text/csv' : 'text/plain' },
    };
  }
}

@Injectable()
export class GetRecommendedWordsTool implements AgentTool {
  name = 'get_recommended_words';
  description =
    'Слова из списков учителя, которых ещё нет в словаре студента: «что мне посоветовал учитель?», «какие слова надо выучить к уроку?». Возвращает списки с названиями и словами.';
  inputSchema = {
    type: 'object' as const,
    properties: {},
    required: [],
    additionalProperties: false,
  };

  constructor(private readonly lists: WordListsService) {}

  async handle(_input: Record<string, never>, ctx: ToolContext): Promise<ToolResult> {
    const recs = await this.lists.recommendedFor(ctx.student);
    return {
      data: {
        lists: recs.map((r) => ({
          title: r.list.title,
          missing: r.items.length,
          words: r.items.slice(0, 30).map((i) => ({ word: i.word, translation: i.translation })),
        })),
        hint:
          recs.length === 0
            ? 'Рекомендаций нет — все слова из списков учителя уже в словаре или списков нет.'
            : 'Предложи добавить все или выбранные через add_recommended_words; студент может и скрыть список.',
      },
    };
  }
}

interface AddRecommendedInput {
  words: string[];
  all: boolean;
  dismiss: boolean;
}

@Injectable()
export class AddRecommendedWordsTool implements AgentTool<AddRecommendedInput> {
  name = 'add_recommended_words';
  description =
    'Принять рекомендации учителя: all=true — добавить все недостающие слова из его списков; или words — только перечисленные. dismiss=true вместо добавления скрывает перечисленные (или все) рекомендации — больше не предлагаем. Добавленные слова получают приоритет.';
  inputSchema = {
    type: 'object' as const,
    properties: {
      words: { type: 'array', items: { type: 'string' } },
      all: { type: 'boolean' },
      dismiss: { type: 'boolean' },
    },
    required: ['words', 'all', 'dismiss'],
    additionalProperties: false,
  };

  constructor(
    private readonly lists: WordListsService,
    private readonly enrichment: EnrichmentService,
  ) {}

  async handle(input: AddRecommendedInput, ctx: ToolContext): Promise<ToolResult> {
    const recs = await this.lists.recommendedFor(ctx.student);
    const wanted = new Set(input.words.map(lemmaOf));
    const ids = input.all
      ? ('all' as const)
      : recs
          .flatMap((r) => r.items)
          .filter((i) => wanted.has(i.lemma))
          .map((i) => i.id);
    if (ids !== 'all' && ids.length === 0)
      return { data: { added: [], reason: 'no matching recommendations' } };

    if (input.dismiss) {
      const hidden = await this.lists.dismiss(ctx.student, ids);
      return { data: { dismissed: hidden } };
    }
    const result = await this.lists.accept(ctx.student, ids);
    if (result.added.length > 0) {
      this.enrichment.enrichLater(
        result.added.map((w) => w.lemma ?? lemmaOf(w.word)),
        ctx.student.id,
      );
    }
    return { data: { ...addedData(result), note: 'Перевод и примеры подберутся в фоне.' } };
  }
}
