export const ServiceCode = {
  UNKNOWN: '00',
  AUTH: '01',
  GROUPS: '02',
  STUDENTS: '03',
  WORDS: '04',
  REPORTS: '05',
  PRESENTATIONS: '06',
  SCHEDULER: '07',
  BOT: '08',
  PARSER: '09',
  HEALTH: '10',
} as const;

export type ServiceCode = (typeof ServiceCode)[keyof typeof ServiceCode];
