import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Word } from './word.entity';
import { WordsService } from './words.service';

@Module({
  imports: [TypeOrmModule.forFeature([Word])],
  providers: [WordsService],
  exports: [WordsService],
})
export class WordsModule {}
