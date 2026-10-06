import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AppConfigService } from '../../../config/config.service';
import { CardsService, QueueItem } from '../../../domain/cards/cards.service';
import { Student } from '../../../domain/students/student.entity';
import { JwtAuthGuard, StudentGuard } from '../auth/guards';
import { CurrentStudent } from '../auth/principal';

class CardAnswerDto {
  @IsString() @MinLength(1) @MaxLength(500) answer!: string;
}

function queueView(q: QueueItem): Record<string, unknown> {
  return {
    id: q.word.id,
    word: q.word.word,
    translation: q.word.translation,
    stage: q.word.stage,
    priority: q.word.priority,
    source: q.word.source,
    overdue: q.overdue,
    reason: q.reason,
    nextDueAt: q.word.nextDueAt,
  };
}

/** 02 · Карточки — one card at a time, no session: answer one and leave. */
@ApiTags('me · cards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('me/cards')
export class MeCardsController {
  constructor(
    private readonly cards: CardsService,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Today's norm, the queue preview and the card currently shown (if any)",
  })
  async state(@CurrentStudent() student: Student): Promise<Record<string, unknown>> {
    const now = new Date();
    const tz = this.config.timezone;
    const [today, queue, current] = await Promise.all([
      this.cards.today(student.id, now, tz),
      this.cards.queue(student.id, now, tz, 10),
      this.cards.current(student, now, tz),
    ]);
    return { today, queue: queue.map(queueView), current };
  }

  @Post('next')
  @ApiOperation({
    summary: 'Show the next card (resumes an unanswered one); null when nothing is due',
  })
  async next(@CurrentStudent() student: Student): Promise<Record<string, unknown>> {
    const now = new Date();
    const card = await this.cards.next(student, now, this.config.timezone);
    return {
      card,
      today: card?.today ?? (await this.cards.today(student.id, now, this.config.timezone)),
    };
  }

  @Post(':attemptId/answer')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Answer the card; stage 3 is checked by AI (an outage counts as correct)',
  })
  answer(
    @CurrentStudent() student: Student,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: CardAnswerDto,
  ): ReturnType<CardsService['answer']> {
    return this.cards.answer(student, attemptId, dto.answer, new Date(), this.config.timezone);
  }

  @Post(':attemptId/give-up')
  @ApiOperation({
    summary: '"Не помню — покажи ответ": counts as a mistake, the word returns tomorrow',
  })
  giveUp(
    @CurrentStudent() student: Student,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ): ReturnType<CardsService['answer']> {
    return this.cards.answer(student, attemptId, null, new Date(), this.config.timezone);
  }

  @Post(':attemptId/skip')
  @ApiOperation({ summary: 'Put the card aside for today (no effect on the word or the norm)' })
  async skip(
    @CurrentStudent() student: Student,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ): Promise<Record<string, unknown>> {
    return { today: await this.cards.skip(student, attemptId, new Date(), this.config.timezone) };
  }
}
