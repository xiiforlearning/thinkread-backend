export const globalConfig = {
  reading: {
    minPagesPerDay: 10,
    maxPagesPerDay: 15,
  },

  schedule: {
    morningTime: '08:00',
    eveningTime: '20:00',
    finalizeTime: '00:05',
    /** Weekly teacher report: Saturday (cron dow 6) at 09:00, covering the just-finished Mon–Fri. */
    weeklyReport: { cronDow: 6, time: '09:00' },
    /** Days the bot runs the daily flow (0=Sun … 6=Sat). Mon–Fri only. */
    classDays: [1, 2, 3, 4, 5] as readonly number[],
  },

  streaks: {
    inactiveDaysForPresentation: 3,
  },

  spacedRepetition: {
    initialEase: 2.5,
    minEase: 1.3,
    maxEase: 2.7,
    easeIncrement: 0.05,
    easeDecrement: 0.2,
    firstIntervalDays: 1,
    secondIntervalDays: 3,
    defaultSessionSize: 10,             // 1–this due → auto-start all; more → chooser
    sessionSizeOptions: [20, 50, 100],  // shown when due exceeds each threshold
    secondsPerCard: 30,                 // for time estimate in chooser
  },

  reports: {
    maxMessageLength: 4000,
    /**
     * Anti-AI morning self-check: a student's weekly recall accuracy on their
     * own new words. Below `suspectRate` with at least `minSampleWords` answered
     * is flagged (advisory only) in the weekly report.
     */
    recall: {
      minSampleWords: 8,
      suspectRate: 0.4,
    },
  },

  admin: {
    /** Telegram admin custom_title that marks a user as a teacher of the group. Case-insensitive. */
    teacherCustomTitle: 'teacher',
  },

  bot: {
    polling: true,
    longPollingTimeoutSec: 30,
  },
};
