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
    /** A second report of the same type on the same local day is refused (norm can't be closed in one evening). */
    maxReportsPerTypePerDay: 1,
    /**
     * Submission windows (customer decision 02.11.2026, N1): each of the week's reports of a type
     * belongs to its own window — Mon–Tue, Wed–Thu, Fri–Sun (ISO weekdays, local time). A window
     * closes on its last day; a missed one burns and is never caught up later, a second report
     * in the same window does not open a new slot. The weekly norm is the number of windows.
     */
    slotWindows: [
      [1, 2],
      [3, 4],
      [5, 6, 7],
    ] as readonly (readonly number[])[],
    /**
     * A report counts only with at least this many confirmed new words (owner setting). 0 = a
     * report without new words is accepted and marked "без новых слов".
     */
    minWordsPerReport: 0,
    /** Reports in a row without new words that raise the quiet NO_NEW_WORDS flag. */
    noNewWordsFlagAfter: 2,
    /**
     * The longest report text the form accepts, in characters of the prose (the word list is not
     * counted); longer = the student is asked to shorten (owner setting, customer 02.11.2026).
     */
    maxReportChars: 1500,
    /**
     * The first local day the school counts (YYYY-MM-DD, owner setting). Before it nobody is
     * "silent", the Monday summary raises no flags and sends nothing, reminders stay quiet —
     * the week of the move to ThinkRead is a grace week. Empty = from the beginning.
     */
    startsOn: '2026-10-26',
  },

  cards: {
    /** Correct answers on a stage before the word moves to the next stage (customer: 1). */
    correctToAdvance: 1,
    /** Successes on stage 3 before a word is marked LEARNED (0 = manual only; customer: 1). */
    stage3ToLearned: 1,
    /** Days until the next review after the 1st, 2nd, 3rd+ correct answer; a mistake = tomorrow, intervals are kept. */
    intervalsDays: [1, 3, 7] as readonly number[],
    /** Stage-3 (own sentence) cards shown in a row at most — they cost AI and effort. */
    maxStage3InRow: 2,
  },

  words: {
    /**
     * W6 (teacher, 02.11.2026): A1 vocabulary from a report's list is shown unticked on the
     * confirmation screen and added only if the student ticks it. true = add like any word.
     */
    autoAddBasic: false,
    /** Adding more than this many words at once requires confirmation. */
    bulkImportConfirmThreshold: 5,
    importPreviewTtlHours: 24,
    /** The most words one report can add (owner setting); the rest are left out of the preview. */
    maxPerReport: 30,
    /** The most words a student can add in one local day, from reports, by hand and by import (W4). */
    maxPerDay: 30,
  },

  reminders: {
    cardsTime: '18:00',
    /** 0=Sun … 6=Sat. The last day of each submission window: Tue, Thu, Sun. */
    reportDays: [2, 4, 0] as readonly number[],
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
    /**
     * Style signals (STYLE_MISMATCH, TOO_POLISHED) need this many previous reports with
     * connected prose and measured metrics; with fewer the check only looks at the content
     * signals.
     */
    authenticityMinHistory: 3,
    /** Measured style signals (see AuthenticityService.judgeStyle). */
    style: {
      /** Prose shorter than this is not judged on style at all. */
      minProseWords: 60,
      /** Above-level fragments (verified quotes) needed alongside the error-rate signal. */
      minAdvanced: 2,
      /** STYLE_MISMATCH: errors per 100 words fell to this fraction of the student's usual rate… */
      dropFactor: 3,
      /** …and the usual rate was at least this (a student who always writes clean has no jump). */
      baselineMinErrors: 3,
      /** TOO_POLISHED: errors per 100 words at or below this for the level… */
      cleanErrorsByLevel: {
        PRE_INTERMEDIATE: 1.5,
        INTERMEDIATE: 1.0,
        UPPER_INTERMEDIATE: 0.7,
        ADVANCED: 0.4,
        IELTS: 0.4,
      } as Record<string, number>,
      /** …while the student's usual rate is at least this many times the clean threshold. */
      cleanBaselineFactor: 2,
    },
    /** Self-assessed first-pass % this far above the student's average is a PCT_JUMP flag. */
    pctJumpThreshold: 30,
  },

  health: {
    yellowInactiveDays: 4,
    redInactiveDays: 8,
  },

  /** The school's timezone for "today" / "this week" in the pure helpers; `TZ` overrides it at runtime. */
  timezone: 'Asia/Tashkent',

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
