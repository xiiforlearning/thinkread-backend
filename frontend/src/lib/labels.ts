import type { GroupLevel, ListeningMethod, WordSource } from '../api/types';

export const LEVEL_LABEL: Record<GroupLevel, string> = {
  PRE_INTERMEDIATE: 'Pre-Intermediate',
  INTERMEDIATE: 'Intermediate',
  UPPER_INTERMEDIATE: 'Upper-Intermediate',
  ADVANCED: 'Advanced',
  IELTS: 'IELTS',
};

export function levelLabel(level: GroupLevel | null): string {
  return level ? LEVEL_LABEL[level] : 'уровень не задан';
}

export const METHOD_LABEL: Record<ListeningMethod, string> = {
  PODCAST_WITH_SCRIPT: 'Подкаст со скриптом',
  SERIES: 'Сериал без субтитров',
  PODCAST_NO_TRANSCRIPT: 'Подкаст без транскрипта',
};

export const METHOD_SHORT: Record<ListeningMethod, string> = {
  PODCAST_WITH_SCRIPT: 'подкасты со скриптом',
  SERIES: 'сериалы без субтитров',
  PODCAST_NO_TRANSCRIPT: 'подкасты без транскрипта',
};

export const SOURCE_LABEL: Record<WordSource, string> = {
  READING: 'Из отчёта о чтении',
  PODCAST: 'Из отчёта об аудировании',
  SERIES: 'Из отчёта об аудировании',
  MANUAL: 'Добавил сам',
  IMPORT: 'Импорт списка',
  TEACHER: 'Список учителя',
};

export const STAGE_LABEL: Record<1 | 2 | 3, string> = {
  1: 'перевод',
  2: 'в предложении',
  3: 'своё предложение',
};

/** Six steps of the listening method, per level group. */
export const METHOD_STEPS: Record<ListeningMethod, Array<{ title: string; subtitle: string }>> = {
  PODCAST_WITH_SCRIPT: [
    { title: 'Прослушай выпуск целиком', subtitle: 'Без скрипта, первый раз' },
    { title: 'Отметь, сколько понял', subtitle: 'Примерный процент' },
    { title: 'Прочитай скрипт', subtitle: 'Выпиши незнакомые слова' },
    { title: 'Переслушай со скриптом', subtitle: 'Следи глазами за текстом' },
    { title: 'Финальное прослушивание', subtitle: 'Уже без скрипта, цель — около 90%' },
    { title: 'Отчёт', subtitle: 'Название, % с первого раза, слова' },
  ],
  SERIES: [
    { title: 'Посмотри серию с субтитрами', subtitle: 'Английские субтитры, первый раз' },
    { title: 'Выпиши новые слова', subtitle: 'Из субтитров' },
    { title: 'Посмотри ещё раз без субтитров', subtitle: 'Главная часть работы' },
    { title: 'Отметь, сколько понял', subtitle: 'Примерный процент во второй раз' },
    { title: 'Перескажи серию', subtitle: '2–3 предложения на английском' },
    { title: 'Отчёт', subtitle: 'Сериал, серия, %, пересказ, слова' },
  ],
  PODCAST_NO_TRANSCRIPT: [
    { title: 'Прослушай выпуск целиком', subtitle: 'Без пауз, первый раз' },
    { title: 'Перескажи по памяти', subtitle: '2–3 предложения на английском' },
    { title: 'Переслушай непонятные места', subtitle: 'Запиши, как слышится' },
    { title: 'Проверь слова в словаре', subtitle: 'Добавь новые в свой список' },
    { title: 'Финальное прослушивание', subtitle: 'Цель — около 90% понимания' },
    { title: 'Отчёт', subtitle: 'Название, % с первого раза, пересказ, слова' },
  ],
};

export const METHOD_EXAMPLE: Record<ListeningMethod, string> = {
  PODCAST_WITH_SCRIPT:
    'слушал 6 Minute English про сон\nс первого раза ~60%, со скриптом всё понял\nнепонятно было: "sleep debt"\nслова: drowsy — сонный, nap — короткий сон',
  SERIES:
    'смотрел Friends, 2 сезон 5 серия\nс субтитрами понял почти всё, без субтитров ~75%\nThe episode was about Ross and Rachel. They argued about a letter.\nслова: awkward — неловкий, grumpy — ворчливый',
  PODCAST_NO_TRANSCRIPT:
    'слушал 6 Minute English про сон\nс первого раза ~70%, после третьего ~88%\nThe episode was about why we sleep. The hosts said that a short nap helps memory, but long naps make you drowsy.\nнепонятно: "sleep debt"\nслова: drowsy — сонный, nap — короткий сон',
};

export const CLARIFY_FIELD_LABEL: Record<string, string> = {
  retelling: 'Пересказ своими словами',
  sourceTitle: 'Название',
  episode: 'Серия',
  firstPassPct: 'Понимание с первого раза',
  secondPassPct: 'Понимание после переслушивания',
  listenCount: 'Сколько раз слушал',
  pages: 'Сколько страниц',
  summary: 'О чём было',
  unclearParts: 'Что осталось непонятным',
};
