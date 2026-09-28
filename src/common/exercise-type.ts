/**
 * The two daily exercises a student can do. Stored on `words.exercise_type`
 * (source of a submitted word) and reflected by `daily_reports.did_listening`
 * / `did_reading`. Reading requires new words; listening words are optional.
 */
export type ExerciseType = 'listening' | 'reading';

export const EXERCISE_TYPES: readonly ExerciseType[] = ['listening', 'reading'];
