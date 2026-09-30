import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentsModule } from '../students/students.module';
import { LexiconService } from './lexicon.service';
import { WordImport } from './word-import.entity';
import { WordImportsService } from './word-imports.service';
import { WordLexicon } from './word-lexicon.entity';
import { WordList, WordListDismissal, WordListItem } from './word-list.entity';
import { WordListsService } from './word-lists.service';
import { Word } from './word.entity';
import { WordsService } from './words.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Word,
      WordLexicon,
      WordImport,
      WordList,
      WordListItem,
      WordListDismissal,
    ]),
    StudentsModule,
  ],
  providers: [LexiconService, WordsService, WordImportsService, WordListsService],
  exports: [LexiconService, WordsService, WordImportsService, WordListsService],
})
export class WordsModule {}
