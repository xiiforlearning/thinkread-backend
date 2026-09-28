import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThanOrEqual, MoreThanOrEqual, Not, Repository } from 'typeorm';
import type { ExerciseType } from '../../common/exercise-type';
import { globalConfig } from '../../config/global.config';
import type { ParsedWord } from './parsed-word';
import { applyKnew, applyNope, nextReviewDate } from './sm2';
import { Word } from './word.entity';

@Injectable()
export class WordsService {
  constructor(
    @InjectRepository(Word)
    private readonly repo: Repository<Word>,
  ) {}

  async insertMany(
    studentId: string,
    items: ParsedWord[],
    exerciseType: ExerciseType = 'reading',
  ): Promise<Word[]> {
    if (items.length === 0) return [];
    const now = new Date();

    const rows = items.map((it) =>
      this.repo.create({
        studentId,
        word: it.word,
        translation: it.translation,
        exerciseType,
        intervalDays: globalConfig.spacedRepetition.firstIntervalDays,
        nextReviewAt: now,
        reviewCount: 0,
        lapses: 0,
        ease: globalConfig.spacedRepetition.initialEase,
      }),
    );
    return this.repo.save(rows);
  }

  countByStudent(studentId: string): Promise<number> {
    return this.repo.count({ where: { studentId } });
  }

  /** Aggregate flashcard stats for the per-student detail view. */
  async statsForStudent(
    studentId: string,
  ): Promise<{ total: number; due: number; avgEase: number; lapses: number }> {
    const total = await this.countByStudent(studentId);
    const due = await this.countDue(studentId);
    const raw = await this.repo
      .createQueryBuilder('w')
      .select('COALESCE(AVG(w.ease), 0)', 'avgEase')
      .addSelect('COALESCE(SUM(w.lapses), 0)', 'lapses')
      .where('w.student_id = :studentId', { studentId })
      .getRawOne<{ avgEase: string; lapses: string }>();
    return {
      total,
      due,
      avgEase: Number(raw?.avgEase ?? 0),
      lapses: Number(raw?.lapses ?? 0),
    };
  }

  findDue(studentId: string, limit: number): Promise<Word[]> {
    return this.repo.find({
      where: { studentId, nextReviewAt: LessThanOrEqual(new Date()) },
      order: { nextReviewAt: 'ASC' },
      take: limit,
    });
  }

  countDue(studentId: string): Promise<number> {
    return this.repo.count({
      where: { studentId, nextReviewAt: LessThanOrEqual(new Date()) },
    });
  }

  countAddedSince(studentId: string, since: Date): Promise<number> {
    return this.repo.count({
      where: { studentId, addedAt: MoreThanOrEqual(since) },
    });
  }

  /** Words added by these students between [startUTC, endUTC), ordered by addedAt ASC. */
  findAddedBetween(studentIds: string[], startUTC: Date, endUTC: Date): Promise<Word[]> {
    if (studentIds.length === 0) return Promise.resolve([]);
    return this.repo.find({
      where: {
        studentId: In(studentIds),
        addedAt: Between(startUTC, endUTC),
      },
      order: { studentId: 'ASC', addedAt: 'ASC' },
    });
  }

  findById(id: string): Promise<Word | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * After answering, find the next due word for this student, excluding the
   * one just answered (so back-to-back answers don't re-show the same card
   * if SM-2 happens to schedule it again soon).
   */
  findNextDueExcept(studentId: string, exceptId: string): Promise<Word | null> {
    return this.repo.findOne({
      where: {
        studentId,
        id: Not(exceptId),
        nextReviewAt: LessThanOrEqual(new Date()),
      },
      order: { nextReviewAt: 'ASC' },
    });
  }

  async applyKnewAnswer(word: Word, now: Date = new Date()): Promise<Word> {
    const next = applyKnew({
      intervalDays: word.intervalDays,
      ease: word.ease,
      reviewCount: word.reviewCount,
      lapses: word.lapses,
    });
    word.intervalDays = next.intervalDays;
    word.ease = next.ease;
    word.reviewCount = next.reviewCount;
    word.lapses = next.lapses;
    word.nextReviewAt = nextReviewDate(next.intervalDays, now);
    return this.repo.save(word);
  }

  async applyNopeAnswer(word: Word, now: Date = new Date()): Promise<Word> {
    const next = applyNope({
      intervalDays: word.intervalDays,
      ease: word.ease,
      reviewCount: word.reviewCount,
      lapses: word.lapses,
    });
    word.intervalDays = next.intervalDays;
    word.ease = next.ease;
    word.reviewCount = next.reviewCount;
    word.lapses = next.lapses;
    word.nextReviewAt = nextReviewDate(next.intervalDays, now);
    return this.repo.save(word);
  }

  save(word: Word): Promise<Word> {
    return this.repo.save(word);
  }
}
