export const presentationMessages = {
  streakBrokenGroupPost: (mention: string): string =>
    `${mention} пропустил 3 дня — готовит презентацию на следующее занятие.`,

  buildMention: (username: string | null, fullName: string): string =>
    username ? `@${username}` : fullName,

  skipUsage: 'Использование: /skip_presentation <studentId>',
  skipStudentNotFound: (studentId: string): string => `Студент ${studentId} не найден.`,
  skipNoPending: (fullName: string): string =>
    `У ${fullName} нет невыполненных презентаций.`,
  skipDone: (fullName: string): string =>
    `Презентация ${fullName} помечена как выполненная.`,
};
