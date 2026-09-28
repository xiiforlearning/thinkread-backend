export const ErrorLevel = {
  INFO: 1,
  LOW_VALIDATION: 2,
  LOW_BUSINESS: 3,
  MEDIUM_REPEATING: 4,
  MEDIUM_PARTIAL: 5,
  HIGH_INTEGRATION: 6,
  HIGH_FUNCTIONAL: 7,
  CRITICAL_DATA_LOSS: 8,
  CRITICAL_SYSTEM_DOWN: 9,
} as const;

export type ErrorLevel = (typeof ErrorLevel)[keyof typeof ErrorLevel];

export const HIGH_PRIORITY_LEVEL_MIN = ErrorLevel.MEDIUM_REPEATING;
