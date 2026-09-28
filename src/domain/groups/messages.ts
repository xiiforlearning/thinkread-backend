import { GroupLevel } from './level';

export const LEVEL_LABELS: Record<GroupLevel, string> = {
  [GroupLevel.PRE_INTERMEDIATE]: 'Pre-Intermediate',
  [GroupLevel.INTERMEDIATE]: 'Intermediate',
  [GroupLevel.UPPER_INTERMEDIATE]: 'Upper-Intermediate',
  [GroupLevel.ADVANCED]: 'Advanced',
  [GroupLevel.IELTS]: 'IELTS',
};

export const groupMessages = {
  askLevel: (title: string): string =>
    [
      `Меня добавили в группу «${title}».`,
      'Какой у неё уровень? От этого зависит методика аудирования для студентов группы. Задаётся один раз, потом можно поменять в админке.',
    ].join('\n'),

  levelSet: (title: string, level: GroupLevel): string =>
    `Готово: «${title}» — ${LEVEL_LABELS[level]}.`,

  levelUnknownGroup: 'Не нашёл такую группу — возможно, меня из неё уже удалили.',

  notOwner: 'Уровень группы может задать только владелец школы.',
};
