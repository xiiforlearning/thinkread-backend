import { GroupLevel } from './level';

export const LEVEL_LABELS: Record<GroupLevel, string> = {
  [GroupLevel.PRE_INTERMEDIATE]: 'Pre-Intermediate',
  [GroupLevel.INTERMEDIATE]: 'Intermediate',
  [GroupLevel.UPPER_INTERMEDIATE]: 'Upper-Intermediate',
  [GroupLevel.ADVANCED]: 'Advanced',
  [GroupLevel.IELTS]: 'IELTS',
};

export const groupMessages = {
  askLevel: (title: string, addedBy: string): string =>
    [
      `Меня добавили в группу «${title}» (добавил: ${addedBy}).`,
      'Пока вы не выберете уровень, группа не подключена: её участники и учителя доступа не получают.',
      'Какой у неё уровень? От этого зависит методика аудирования для студентов группы. Потом можно поменять в дашборде.',
    ].join('\n'),

  rejectButton: 'Не наша группа',
  rejected: (title: string): string => `«${title}» — не наша группа. Я вышел из неё.`,

  levelSet: (title: string, level: GroupLevel): string =>
    `Готово: «${title}» — ${LEVEL_LABELS[level]}.`,

  levelUnknownGroup: 'Не нашёл такую группу — возможно, меня из неё уже удалили.',

  notOwner: 'Уровень группы может задать только владелец школы.',
};
