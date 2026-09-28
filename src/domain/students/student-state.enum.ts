export enum StudentState {
  IDLE = 'IDLE',
  AWAITING_BOOK_TITLE = 'AWAITING_BOOK_TITLE',
  AWAITING_BOOK_TOTAL_PAGES = 'AWAITING_BOOK_TOTAL_PAGES',
  AWAITING_BOOK_START_PAGE = 'AWAITING_BOOK_START_PAGE',
  // Evening exercise flow (v2): waiting for the listening/reading Да-Нет button taps.
  AWAITING_EVENING_EXERCISES = 'AWAITING_EVENING_EXERCISES',
  // Optional words for the listening exercise (skippable).
  AWAITING_EVENING_LISTENING_WORDS = 'AWAITING_EVENING_LISTENING_WORDS',
  // Mandatory words for the reading exercise.
  AWAITING_EVENING_WORDS = 'AWAITING_EVENING_WORDS',
  AWAITING_EVENING_PAGE = 'AWAITING_EVENING_PAGE',
  AWAITING_NEW_WORD = 'AWAITING_NEW_WORD',
  AWAITING_NEW_TRANSLATION = 'AWAITING_NEW_TRANSLATION',
  // Anti-AI (v2): morning typed reverse-recall check of the student's own words.
  AWAITING_RECALL_ANSWER = 'AWAITING_RECALL_ANSWER',
}
