export const ServiceCode = {
  UNKNOWN: '00',
  AUTH: '01',
  GROUPS: '02',
  STUDENTS: '03',
  WORDS: '04',
  REPORTS: '05',
  CARDS: '06',
  SCHEDULER: '07',
  BOT: '08',
  AI: '09',
  HEALTH: '10',
  API: '11',
  NORMS: '12',
  FLAGS: '13',
  MEMBERSHIP: '14',
  TEACHER_REPORTS: '15',
} as const;

export type ServiceCode = (typeof ServiceCode)[keyof typeof ServiceCode];
