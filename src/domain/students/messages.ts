export const studentMessages = {
  greetingAndAskBook: (fullName: string): string =>
    [
      `Привет, ${fullName}! Я бот учёта чтения.`,
      '',
      'Какую книгу ты читаешь? Напиши автора и название одной строкой.',
      'Например: «James Hadley Chase — Strictly for Cash».',
    ].join('\n'),

  askTitleAgain: 'Не понял. Напиши автора и название книги одной строкой.',

  askTotalPages: (bookTitle: string): string =>
    `Принял книгу «${bookTitle}». Сколько в ней всего страниц?`,

  askTotalPagesAgain: 'Это должно быть число больше нуля. Сколько страниц в книге?',

  askStartPage: (bookTotalPages: number): string =>
    [
      `На какой странице ты сейчас?`,
      `Если только начинаешь — напиши 1.`,
      `Если уже читал — напиши номер текущей страницы (от 1 до ${bookTotalPages}).`,
    ].join('\n'),

  askStartPageOutOfRange: (bookTotalPages: number): string =>
    `Страница должна быть в диапазоне от 1 до ${bookTotalPages}. Попробуй ещё раз.`,

  registrationComplete: (bookTitle: string, currentPage: number, totalPages: number): string =>
    [
      'Готово ✅',
      '',
      `Книга: «${bookTitle}»`,
      `Сейчас на странице ${currentPage} из ${totalPages}.`,
      '',
      'По будням утром предложу повторить слова, а вечером спрошу про аудирование и чтение.',
      'По выходным не беспокою.',
      '',
      'Команды:',
      '• /book — сменить книгу',
      '• /mystatus — текущая книга и прогресс',
      '• /help — список команд',
    ].join('\n'),

  notRegistered:
    'Ты ещё не зарегистрирован. Открой ссылку в группе и нажми «📚 Зарегистрироваться».',

  groupInactive:
    'Группа неактивна. Скажи учителю, чтобы он снова добавил бота и открыл регистрацию.',

  startInGroupOnly:
    'Регистрация запускается по ссылке-кнопке из учебной группы. Если её ещё нет — попроси учителя открыть запись командой /open_signup в группе.',

  bookRestartIntro: 'Меняем книгу. Старые слова остаются — повторение продолжится.',
  bookRestartPrompt: 'Напиши автора и название новой книги одной строкой.',

  myStatus: (
    fullName: string,
    bookTitle: string | null,
    currentPage: number | null,
    totalPages: number | null,
  ): string => {
    const lines = [`Студент: ${fullName}`];
    if (bookTitle) {
      lines.push(`Книга: «${bookTitle}»`);
      if (currentPage !== null && totalPages !== null) {
        const left = Math.max(0, totalPages - currentPage);
        lines.push(`Прогресс: ${currentPage} из ${totalPages} (осталось ${left})`);
      }
    } else {
      lines.push('Книга ещё не задана. Напиши /book чтобы выбрать.');
    }
    return lines.join('\n');
  },

  help: [
    'Команды:',
    '• /book — задать или сменить книгу',
    '• /mystatus — твой прогресс',
    '• /page <N> — отметить текущую страницу',
    '• /add — добавить слова по одному (закончить /done)',
    '• /words — отправить слова списком (вечерний формат)',
    '• /review — повторить слова сейчас',
    '• /help — эта подсказка',
  ].join('\n'),

  // Morning flow (v2) -------------------------------------------------------

  morningReviewOffer: (fullName: string, due: number): string =>
    [
      `Доброе утро, ${fullName}! 🌅`,
      'Не забудь сегодня про аудирование и чтение 👂📖',
      '',
      `Слов к повторению: ${due}. Нажми, чтобы начать 👇`,
    ].join('\n'),

  morningNoReview: (fullName: string): string =>
    [
      `Доброе утро, ${fullName}! 🌅`,
      'Не забудь сегодня про аудирование и чтение 👂📖',
      '',
      'Новых слов к повторению пока нет.',
    ].join('\n'),

  // Evening flow (v2) -------------------------------------------------------

  eveningAskListening: [
    'Вечерний отчёт 🌙',
    '',
    'Ты сегодня слушал(а) аудирование? 👂',
  ].join('\n'),

  // Edited-in-place result of each Да/Нет answer.
  eveningListeningResult: (did: boolean): string => `Аудирование: ${did ? 'да ✅' : 'нет ❌'}`,
  eveningReadingResult: (did: boolean): string => `Чтение: ${did ? 'да ✅' : 'нет ❌'}`,

  // Reading question, sent after the listening step is finished.
  eveningAskReadingQ: 'А чтение сегодня было? 📖',

  // Optional words from listening — added over several messages, until «Готово».
  askListeningWords: [
    'Запиши новые слова из аудирования 🎧 — по желанию.',
    'Присылай по одному или списком (по паре на строку).',
    'Когда закончишь — жми «Готово».',
    '',
    '  слово — перевод',
  ].join('\n'),

  // Mandatory reading words — the «Готово» button appears after the first word.
  askEveningWordsMandatory: [
    'После чтения выпиши новые слова 📖✍️',
    'Присылай по одному или списком — сколько угодно сообщений.',
    'Когда закончишь — появится кнопка «Готово».',
    '',
    '  слово — перевод',
  ].join('\n'),

  eveningWordAccepted: (count: number): string =>
    `Добавил ${count} ${pluralWord(count)} ✅ Присылай ещё или жми «Готово».`,

  eveningReadingNeedWord:
    'Пришли хотя бы одно слово в формате «слово — перевод».',

  eveningNothingToday: 'Понял 👌 Сегодня без занятий. До завтра!',

  eveningFinished: 'Готово ✅ До завтра!',

  eveningWordsSaved: 'Готово ✅ Слова сохранены. Утром пришлю карточки 🧠',

  eveningPageSkipped: 'Хорошо, страницу пропустил. До завтра!',

  eveningStale: 'Этот отчёт уже отправлен.',

  // Inline-button labels (v2)
  buttonYes: 'Да',
  buttonNo: 'Нет',
  buttonSkip: 'Пропустить',
  buttonDone: 'Готово ✅',
  buttonReviewOpen: (due: number): string => `🧠 Повторить слова (${due})`,

  askEveningPageOptional: [
    'Отметить страницу книги? Необязательно.',
    'Пришли номер страницы или нажми «Пропустить».',
  ].join('\n'),

  bookNotSetYet: 'Сначала задай книгу — напиши /book и я спрошу название и страницы.',

  askEveningWords: [
    'Какие новые слова ты сегодня узнал?',
    'Отправь списком, по одному в строке, в формате:',
    '',
    '  слово — перевод',
    '',
    'Разделители: — (em-dash), – (en-dash), - (с пробелами вокруг), :',
    'Можно ставить маркеры • или нумерацию — я их сниму.',
  ].join('\n'),

  wordsParseEmpty:
    'Не нашёл ни одной пары «слово — перевод». Попробуй ещё раз, по одной паре на строку.',

  wordsSaved: (count: number): string =>
    `Сохранил ${count} ${pluralWord(count)}. Теперь скажи: на какой странице остановился сегодня?`,

  askEveningPage: 'На какой странице ты сегодня остановился?',

  pageOutOfRange: (min: number, max: number): string =>
    `Страница должна быть от ${min} до ${max}. Попробуй ещё раз.`,

  pageSaved: (page: number, total: number, delta: number): string => {
    const deltaText = delta > 0 ? ` (+${delta} ${pluralPage(delta)})` : '';
    return `Записал: страница ${page} из ${total}${deltaText}. Молодец 👍`;
  },

  bookCompleted: (title: string): string =>
    [`🎉 Поздравляю, ты дочитал «${title}»!`, 'Чтобы выбрать новую книгу — /book.'].join('\n'),

  pageUsage: 'Использование: /page <номер> — например, /page 47',

  // Interactive /add flow ---------------------------------------------------

  addStarted: [
    'Окей, добавляем по одному 👇',
    '',
    'Пиши слово — я попрошу перевод. Когда закончишь, отправь /done.',
  ].join('\n'),

  addAwaitTranslation: (word: string): string => `Перевод для «${word}»?`,

  addSaved: (word: string, translation: string): string =>
    `Записал: ${word} — ${translation}.\nСледующее слово (или /done):`,

  addEmpty: 'Пусто. Напиши слово или /done.',

  addLostWord:
    'Не нашёл, к чему относится этот перевод. Начнём со слова — пришли его.',

  addBusyOtherFlow:
    'Сначала закончи текущий шаг (например, вечерний отчёт), потом запускай /add.',

  addBusyBookRegistration:
    'Сначала закончи задание книги. Если хочешь начать заново — /book.',

  addNotInSession: 'Сейчас режим /add не активен. Запусти /add чтобы начать.',

  addFinished: (count: number): string => {
    if (count === 0) return 'Готово. Ничего не добавил в этой сессии.';
    return `Готово. Добавил ${count} ${pluralWord(count)} 👍`;
  },

  // Admin /students view ----------------------------------------------------

  studentsEmpty: 'В этой группе пока нет зарегистрированных студентов.',

  studentsList: (rows: string[]): string => ['Студенты группы:', '', ...rows].join('\n'),

  studentRow: (
    fullName: string,
    bookTitle: string | null,
    currentPage: number | null,
    totalPages: number | null,
  ): string => {
    if (!bookTitle) return `• ${fullName} — книга не задана`;
    if (currentPage === null || totalPages === null) {
      return `• ${fullName} — «${bookTitle}»`;
    }
    return `• ${fullName} — «${bookTitle}» (стр. ${currentPage}/${totalPages})`;
  },
};

function pluralWord(n: number): string {
  const last = n % 10;
  const tens = Math.floor(n / 10) % 10;
  if (tens === 1) return 'слов';
  if (last === 1) return 'слово';
  if (last >= 2 && last <= 4) return 'слова';
  return 'слов';
}

function pluralPage(n: number): string {
  const last = n % 10;
  const tens = Math.floor(n / 10) % 10;
  if (tens === 1) return 'страниц';
  if (last === 1) return 'страница';
  if (last >= 2 && last <= 4) return 'страницы';
  return 'страниц';
}
