import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { Word } from '../words/word.entity';
import { WordsModule } from '../words/words.module';
import { CardAttempt } from './card-attempt.entity';
import { CardsService } from './cards.service';

@Module({
  imports: [TypeOrmModule.forFeature([CardAttempt, Word]), WordsModule, AiModule],
  providers: [CardsService],
  exports: [CardsService],
})
export class CardsModule {}
