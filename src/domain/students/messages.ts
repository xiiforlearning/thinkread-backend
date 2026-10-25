import { Lang } from './language';

export interface StudentTexts {
  notAMember: string;
  askName: string;
  askNameAgain: string;
  welcome: (firstName: string) => string;
  /** PENDING_NAME: the name is entered in the Mini App now. */
  finishInApp: string;
  /** Any text from an active student: the bot is only a door to the app. */
  openApp: string;
  openAppButton: string;
  /** @BotFather "What can this bot do?" — shown above the Start button. */
  botDescription: string;
  /** @BotFather short description — in the profile and when the bot is shared. */
  botShortDescription: string;
  staffInApp: string;
  archived: string;
  restored: string;
  /** Posted in every study group once, when the school moves to ThinkRead (scripts/announce-groups.ts). */
  groupAnnouncement: (link: string) => string;
  groupAnnouncementButton: string;
}

const ru: StudentTexts = {
  notAMember: [
    'Привет! Я ThinkRead — бот для студентов Рустама.',
    'Я работаю только с участниками его учебных групп в Telegram, а тебя в них пока не вижу.',
    'Если ты учишься у Рустама — попроси добавить тебя в группу и напиши мне снова.',
  ].join('\n'),

  askName: [
    'Привет! Я ThinkRead — помогу с чтением, аудированием и новыми словами.',
    '',
    'Для начала напиши свои настоящие имя и фамилию — не ник и не сокращение. Так учитель увидит тебя в списке. Например: Акмаль Хадиев',
  ].join('\n'),

  askNameAgain:
    'Похоже, это не имя и фамилия. Напиши, пожалуйста, настоящие имя и фамилию через пробел, например: Дилара Михаева',

  welcome: (firstName: string): string =>
    [
      `Отлично, ${firstName}! Ты зарегистрирован(а).`,
      '',
      'Просто пиши мне как есть: что прочитал, что послушал, какие слова встретил — я всё пойму и запишу. Норма на неделю: 3 отчёта о чтении и 3 об аудировании, плюс несколько карточек в день.',
      '',
      'Полноценный диалог я ещё дописываю, скоро заработает 🙂',
    ].join('\n'),

  finishInApp:
    'Почти готово! Открой приложение ThinkRead и напиши своё имя и фамилию — дальше всё там: отчёты, словарь и карточки.',

  openApp:
    'Я здесь только напоминаю. Отчёты, слова и карточки — в приложении ThinkRead, открой его кнопкой ниже.',

  openAppButton: 'Открыть ThinkRead',
  botDescription:
    'ThinkRead — помощник школы английского: отчёты о чтении и аудировании, личный словарь и карточки для повторения. Всё в приложении, нажми «Открыть ThinkRead».',
  botShortDescription: 'Отчёты, словарь и карточки для студентов школы английского.',
  staffInApp: 'Вы учитель: ваш инструмент — дашборд. Откройте приложение, оно переведёт вас туда.',

  archived:
    'Твой доступ приостановлен: я не вижу тебя ни в одной из учебных групп. Как только ты вернёшься в группу, всё восстановится — словарь и история на месте.',

  restored: 'С возвращением! Доступ восстановлен, словарь и история на месте.',

  groupAnnouncement: (link: string): string =>
    [
      'Бот обновился: теперь это ThinkRead 📚',
      '',
      'Отчёты о чтении и аудировании, словарь и карточки — в приложении. Открой его по кнопке ниже или по ссылке:',
      link,
      '',
      'В первый раз приложение попросит настоящие имя и фамилию — так учитель увидит тебя в списке.',
    ].join('\n'),
  groupAnnouncementButton: 'Открыть ThinkRead',
};

const en: StudentTexts = {
  notAMember: [
    "Hi! I'm ThinkRead, the bot for Rustam's students.",
    "I only work with members of his Telegram study groups, and I can't see you in any of them yet.",
    'If you study with Rustam, ask him to add you to the group and message me again.',
  ].join('\n'),

  askName: [
    "Hi! I'm ThinkRead — I'll help with reading, listening and new words.",
    '',
    'First, write your real first and last name — not a nickname or an abbreviation — so your teacher can find you in the list. For example: Akmal Khadiev',
  ].join('\n'),

  askNameAgain:
    "That doesn't look like a first and last name. Please write your real first and last name separated by a space, for example: Dilara Mikhaeva",

  welcome: (firstName: string): string =>
    [
      `Great, ${firstName}! You're registered.`,
      '',
      "Just write to me as you go: what you read, what you listened to, which words you met — I'll understand and note it down. The weekly norm: 3 reading reports and 3 listening reports, plus a few cards a day.",
      '',
      "I'm still working on the full conversation, it will be ready soon 🙂",
    ].join('\n'),

  finishInApp:
    'Almost there! Open the ThinkRead app and enter your first and last name — everything else is in there: reports, vocabulary and cards.',

  openApp:
    "I'm only here for reminders. Reports, words and cards live in the ThinkRead app — open it with the button below.",

  openAppButton: 'Open ThinkRead',
  botDescription:
    'ThinkRead is the English school assistant: reading and listening reports, a personal vocabulary and review cards. Everything is in the app — tap "Open ThinkRead".',
  botShortDescription: 'Reports, vocabulary and cards for the English school students.',
  staffInApp:
    "You're a teacher: your tool is the dashboard. Open the app and it will take you there.",

  archived:
    "Your access is paused: I can't see you in any of the study groups. As soon as you're back in a group everything is restored — your vocabulary and history are kept.",

  restored: 'Welcome back! Access restored, your vocabulary and history are in place.',

  groupAnnouncement: (link: string): string =>
    [
      'The bot has been updated: meet ThinkRead 📚',
      '',
      'Reading and listening reports, your vocabulary and review cards now live in the app. Open it with the button below or by the link:',
      link,
      '',
      'On the first visit the app asks for your real first and last name, so your teacher can find you in the list.',
    ].join('\n'),
  groupAnnouncementButton: 'Open ThinkRead',
};

export const studentTexts: Record<Lang, StudentTexts> = { ru, en };

/** Texts in the student's language (Russian when nothing is chosen). */
export function studentMessagesFor(lang: Lang): StudentTexts {
  return studentTexts[lang];
}

/** The Russian texts — the school's default, used where no student is known (bot profile, staff). */
export const studentMessages: StudentTexts = ru;
