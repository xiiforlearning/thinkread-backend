import {
  Body,
  Controller,
  Get,
  Header,
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
import { globalConfig } from '../../../config/global.config';
import { EnrichmentService } from '../../../domain/ai/enrichment.service';
import { localDay } from '../../../domain/norms/week';
import { Student } from '../../../domain/students/student.entity';
import { wordMessages } from '../../../domain/words/messages';
import { lemmaOf, parseWordList } from '../../../domain/words/normalize';
import { WordImportsService } from '../../../domain/words/word-imports.service';
import { Word } from '../../../domain/words/word.entity';
import { WordSource } from '../../../domain/words/word.enums';
import { WordsService } from '../../../domain/words/words.service';
import { JwtAuthGuard, StudentGuard } from '../auth/guards';
import { CurrentStudent } from '../auth/principal';
import {
  AddWordsDto,
  ConfirmImportDto,
  ExportQueryDto,
  ImportTextDto,
  PatchWordDto,
  PriorityDto,
  WordsQueryDto,
} from './dto';
import { wordView } from './serializers';

@ApiTags('me · words')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('me')
export class MeWordsController {
  constructor(
    private readonly words: WordsService,
    private readonly imports: WordImportsService,
    private readonly enrichment: EnrichmentService,
    private readonly config: AppConfigService,
  ) {}

  @Get('words')
  @ApiOperation({ summary: 'Vocabulary with search and filters (newest first)' })
  async list(
    @CurrentStudent() student: Student,
    @Query() q: WordsQueryDto,
  ): Promise<Record<string, unknown>[]> {
    const rows = await this.words.search(student.id, {
      query: q.q,
      status: q.status,
      cefr: q.cefr,
      source: q.source,
      priority: q.priority,
      limit: q.limit ?? 50,
    });
    return rows.map(wordView);
  }

  @Get('words/summary')
  @ApiOperation({ summary: 'Counts by status, priority, CEFR and source' })
  summary(@CurrentStudent() student: Student): ReturnType<WordsService['summary']> {
    return this.words.summary(student.id);
  }

  @Get('words/export')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Whole vocabulary as csv or txt (text body; the client saves it)' })
  async exportWords(
    @CurrentStudent() student: Student,
    @Query() q: ExportQueryDto,
  ): Promise<Record<string, unknown>> {
    const content = await this.words.exportText(student.id, q.format);
    return {
      filename: wordMessages.exportFilename(q.format, localDay(new Date(), this.config.timezone)),
      content,
    };
  }

  @Post('words')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Add words; more than the threshold → import preview to confirm' })
  async add(
    @CurrentStudent() student: Student,
    @Body() dto: AddWordsDto,
  ): Promise<Record<string, unknown>> {
    const parsed = dto.words
      .map((w) => ({ word: w.word.trim(), translation: w.translation?.trim() || null }))
      .filter((w) => w.word);
    if (parsed.length > globalConfig.words.bulkImportConfirmThreshold) {
      const preview = await this.imports.createPreview(student, parsed);
      return { preview: true, ...preview };
    }
    const result = await this.words.addWords(student, parsed, { source: WordSource.MANUAL });
    if (result.added.length > 0) {
      await this.enrichment
        .enrich(
          result.added.map((w) => w.lemma ?? lemmaOf(w.word)),
          student.id,
        )
        .catch(() => undefined);
    }
    const fresh = (await Promise.all(result.added.map((w) => this.words.findById(w.id)))).filter(
      (w): w is Word => w !== null,
    );
    return {
      preview: false,
      added: fresh.map(wordView),
      alreadyHad: result.existing.map(wordView),
      alreadyLearned: result.learned.map(wordView),
    };
  }

  @Post('word-imports')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Free-text list ("word — translation", commas, lines) → preview with duplicates marked',
  })
  async importText(
    @CurrentStudent() student: Student,
    @Body() dto: ImportTextDto,
  ): Promise<Record<string, unknown>> {
    const parsed = parseWordList(dto.text);
    if (parsed.length === 0) {
      throw new AppError({
        level: ErrorLevel.LOW_VALIDATION,
        service: ServiceCode.WORDS,
        error: ErrorCode.PARSE_EMPTY,
      });
    }
    return { ...(await this.imports.createPreview(student, parsed)) };
  }

  @Post('word-imports/:id/confirm')
  @ApiOperation({
    summary: 'Confirm a preview (optionally excluding words); enrichment runs in the background',
  })
  async confirmImport(
    @CurrentStudent() student: Student,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmImportDto,
  ): Promise<Record<string, unknown>> {
    const result = await this.imports.confirm(id, student, dto.excludeWords ?? []);
    if (result.added.length > 0) {
      this.enrichment.enrichLater(
        result.added.map((w) => w.lemma ?? lemmaOf(w.word)),
        student.id,
      );
    }
    return { added: result.added.length, words: result.added.map(wordView) };
  }

  @Post('word-imports/:id/cancel')
  @ApiOperation({ summary: 'Discard a preview' })
  async cancelImport(
    @CurrentStudent() student: Student,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    await this.imports.cancel(id, student);
    return { ok: true };
  }

  @Get('words/:id')
  @ApiOperation({ summary: 'One word' })
  async one(
    @CurrentStudent() student: Student,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    return wordView(await this.owned(student, id));
  }

  @Patch('words/:id')
  @ApiOperation({ summary: 'Edit the translation and/or status (LEARNED / LEARNING)' })
  async patch(
    @CurrentStudent() student: Student,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchWordDto,
  ): Promise<Record<string, unknown>> {
    let word = await this.owned(student, id);
    if (dto.translation !== undefined)
      word = await this.words.updateTranslation(word, dto.translation);
    if (dto.status !== undefined) word = await this.words.setStatus(word, dto.status);
    return wordView(word);
  }

  @Patch('words/:id/priority')
  @ApiOperation({ summary: 'HIGH = review sooner (right after overdue words)' })
  async priority(
    @CurrentStudent() student: Student,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PriorityDto,
  ): Promise<Record<string, unknown>> {
    const word = await this.owned(student, id);
    return wordView(await this.words.setPriority(word, dto.priority));
  }

  private async owned(student: Student, id: string): Promise<Word> {
    const word = await this.words.findById(id);
    if (!word || word.studentId !== student.id) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.WORDS,
        error: ErrorCode.NOT_FOUND,
        meta: { id },
      });
    }
    return word;
  }
}
