export const reportMessages = {
  header: (dateRu: string): string => `📊 Отчёт за ${dateRu}`,

  noData: (dateRu: string): string => `За ${dateRu} нет данных — нет активных групп или студентов.`,

  groupHeader: (title: string): string => `═══ «${title}» ═══`,

  // `name` and `bookTitle` arrive pre-rendered/escaped for HTML parse_mode
  // (see report-formatter.ts): `name` is a clickable profile link.
  studentActive: (
    name: string,
    bookTitle: string,
    pageFrom: number,
    pageTo: number,
    pagesDelta: number,
    wordsCount: number,
    reviewedCount: number,
  ): string => {
    const deltaText =
      pagesDelta > 0 ? `+${pagesDelta} стр.` : `${pagesDelta} стр.`;
    return `👤 ${name} — «${bookTitle}» (стр. ${pageFrom} → ${pageTo}, ${deltaText}, ${wordsCount} ${pluralWord(wordsCount)}, повторено ${reviewedCount})`;
  },

  studentInactive: (name: string, streakDays: number, reviewedCount: number): string => {
    const tail = streakDays >= 2 ? ` (${streakDays}-й день подряд)` : '';
    const reviewed = reviewedCount > 0 ? ` · повторено ${reviewedCount}` : '';
    return `👤 ${name} — ❌ не сдал ничего${tail}${reviewed}`;
  },

  studentInactiveFreshPresentation: (name: string, streakDays: number): string =>
    `⚠️ ${name} — ${streakDays}-й день молчит, назначена презентация`,

  studentNoBook: (name: string): string => `👤 ${name} — книга не задана`,

  // --- Weekly report (v2) ---

  weeklyHeader: (range: string): string => `📅 Недельный отчёт · ${range}`,

  weeklyLegendLine: 'Отметки в таблице: + сделал · пропустил',

  weeklyNoGroups: 'Нет активных групп или студентов за эту неделю.',

  weeklyGroupEmpty: 'В группе пока нет студентов.',

  weeklyAiFlag: '⚠️ ИИ?',

  weeklyStatusIdle: 'нет активности за неделю',

  weeklyStatusInactive: (streak: number): string => `⚠️ ${streak} дн. без занятий`,

  // --- Per-student detail (v2, /student) ---

  detailHeader: (name: string, groupTitle: string): string => `👤 ${name} · «${groupTitle}»`,

  detailBook: (bookTitle: string, page: number | null, total: number | null): string => {
    if (page === null || total === null) return `📗 «${bookTitle}»`;
    return `📗 «${bookTitle}» — стр. ${page}/${total}`;
  },

  detailNoBook: 'Книга не задана',

  detailPeriod: (range: string): string => `Период: ${range}`,

  detailDaysTitle: 'По дням',

  detailWordsTitle: (count: number): string => `Новые слова (${count})`,

  detailWordsSplit: (listening: number, reading: number): string =>
    `🎧 из аудир.: ${listening} · 📖 из чтения: ${reading}`,

  detailWordsEmpty: 'За период новых слов нет.',

  detailFlashTitle: 'Флешкарты',

  detailFlashLine: (total: number, due: number, avgEase: number, lapses: number): string =>
    `Всего ${total} · к повторению ${due} · ср. лёгкость ${avgEase.toFixed(2)} · срывов ${lapses}`,

  detailAuthTitle: 'Самостоятельность',

  detailAuthRecall: (correct: number, total: number, pct: number): string =>
    `Свои слова на утреннем опросе: ${pct}% верных (${correct}/${total}).`,

  detailAuthRecallInsufficient: 'Свои слова на утреннем опросе: недостаточно данных.',

  detailAuthForwarded: (days: number): string => `Отправлено пересылкой/через бота: ${days} дн.`,

  detailAuthClean: 'Явных сигналов нет.',

  detailNotFound: 'Студент не найден среди твоих групп.',

  detailAmbiguous: (rows: string[]): string =>
    ['Нашёл нескольких. Уточни командой /student <id>:', '', ...rows].join('\n'),

  detailUsage: 'Использование: /student <имя | @username | id>',

  /** "слово / слова / слов" Russian plural. */
};

function pluralWord(n: number): string {
  const last = n % 10;
  const tens = Math.floor(n / 10) % 10;
  if (tens === 1) return 'слов';
  if (last === 1) return 'слово';
  if (last >= 2 && last <= 4) return 'слова';
  return 'слов';
}
