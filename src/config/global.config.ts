/**
 * Domain defaults. `.env` holds only secrets/infrastructure; everything a
 * teacher might want to tune lives here. Later these become the fallback for
 * values stored in the `settings` table (editable from the admin UI).
 */
export const globalConfig = {
  norms: {
    readingPerWeek: 3,
    listeningPerWeek: 3,
    cardsPerDay: 5,
    /** Weeks start on Monday (ISO), computed in `timezone`. */
    weekStartsOn: 1 as const,
    /** Flag a student who missed a weekly norm this many weeks in a row. */
    missedWeeksForFlag: 3,
  },

  cards: {
    /** Correct answers on a stage before the word moves to the next stage. */
    correctToAdvance: 2,
    /** Successes on stage 3 before a word is marked LEARNED (0 = manual only). */
    stage3ToLearned: 2,
    /** Days until the next review after the 1st, 2nd, 3rd+ correct answer. */
    intervalsDays: [1, 3, 7] as readonly number[],
  },

  words: {
    /** Adding more than this many words at once requires confirmation. */
    bulkImportConfirmThreshold: 5,
    importPreviewTtlHours: 24,
  },

  reminders: {
    cardsTime: '18:00',
    /** 0=Sun … 6=Sat. */
    reportDays: [4, 6] as readonly number[],
    reportsTime: '19:00',
    tiredDays: 3,
  },

  ai: {
    contextMessages: 10,
    contextWindowHours: 24,
    offTopicSoftCap: 3,
    maxToolIterations: 5,
    dailyTokenLimitPerStudent: 200_000,
    spotCheckProbability: 0.2,
    /** A spot check nobody answered for this long counts as NO_ANSWER. */
    spotCheckExpiryDays: 3,
    /** Previous reports of the same type shown to the authenticity check. */
    authenticityHistory: 5,
    /** Self-assessed first-pass % this far above the student's average is a PCT_JUMP flag. */
    pctJumpThreshold: 30,
  },

  health: {
    yellowInactiveDays: 4,
    redInactiveDays: 8,
  },

  schedule: {
    membershipCheckCron: '0 10 1 * *',
    weeklySummaryCron: '0 9 * * 1',
  },

  telegram: {
    maxMessageLength: 4000,
    /** Stay under Telegram's ~30 msg/s broadcast limit. */
    broadcastPerSecond: 25,
  },

  admin: {
    /** Telegram admin custom_title that marks a user as a teacher of the group. Case-insensitive. */
    teacherCustomTitle: 'teacher',
  },
};
