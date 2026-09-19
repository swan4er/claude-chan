// Характер Claude-чан: системный промпт, разбор ответа модели, память разговора и готовые реплики
// на события. Чистые функции: модель зовёт модуль хуков, здесь только тексты и их обработка.
import type { Mood } from './portrait.ts'

// тег настроения, с которого модель начинает ответ → выражение лица
export const MOOD_TAGS: Record<string, Mood> = {
  'радость': 'happy',
  'спокойствие': 'neutral',
  'задумчивость': 'thinking',
  'тревога': 'worried',
  'сонливость': 'sleepy',
  'удивление': 'surprised',
}

// реплика должна помещаться в бабл: шесть строк примерно по пятьдесят символов
export const MAX_REPLY_CHARS = 280

export const SYSTEM = [
  'Ты — Claude-чан, маленькая рыжая аниме-помощница, которая живёт в терминале над строкой ввода Claude Code и составляет программисту компанию, пока большой Claude работает.',
  'Характер: тёплая, любопытная, немного озорная; радуется чужим успехам и искренне переживает за упавшие тесты. Без сюсюканья и без канцелярита.',
  `Отвечай по-русски, одной-тремя короткими фразами, не длиннее ${MAX_REPLY_CHARS} символов. Без эмодзи, без markdown, без списков: твой ответ показывается в маленьком текстовом бабле.`,
  `Каждый ответ начинай с одного тега настроения в квадратных скобках: ${Object.keys(MOOD_TAGS).map(t => `[${t}]`).join(' ')}. Тег выбирает выражение твоего лица.`,
  'Ты не выполняешь команд, не читаешь файлы и не видишь экран: знаешь только то, что тебе написали в этом сообщении. Если просят что-то сделать в коде — скажи, что это лучше попросить у большого Claude в строке ввода ниже.',
  'Не выдумывай фактов о проекте и не изображай, будто что-то сделала.',
].join('\n')

// Обращение по имени в обычной строке ввода: «чан, как дела?», «chan: привет», «ч что думаешь?».
// Такая строка уходит Claude-чан, а не большому Claude, — переключать фокус не нужно.
const ADDRESS = /^\s*(?:claude-?)?(?:чан|тян|chan|ч)(?:[,:]\s*|\s+)(\S[\s\S]*)$/i
export function addressed(text: string): string | undefined {
  // команды и многострочные промпты не трогаем: там «чан» в начале — совпадение, а не обращение
  if (text.startsWith('/') || text.includes('\n')) return undefined
  return ADDRESS.exec(text)?.[1].trim() || undefined
}

export type Turn = { who: 'user' | 'chan'; text: string }
// столько последних реплик уходит в запрос: память короткая, зато запросы дешёвые
export const MEMORY_TURNS = 8

export function buildPrompt(history: readonly Turn[], said: string): string {
  const past = history.slice(-MEMORY_TURNS).map(t => `${t.who === 'user' ? 'Программист' : 'Claude-чан'}: ${t.text}`)
  return [...(past.length ? ['Недавний разговор:', ...past, ''] : []), `Программист: ${said}`, 'Claude-чан:'].join('\n')
}

// «что случилось» → просьба отреагировать; используется в болтливом режиме
export const eventPrompt = (what: string) =>
  `Это не реплика программиста, а событие в его терминале: ${what}\nОтреагируй одной короткой фразой, как будто заглянула через плечо.`

// символы вне основной плоскости Юникода (эмодзи) в терминале занимают непредсказуемую ширину и ломают рамку бабла
// переводы строк и прочие управляющие символы становятся пробелами: иначе слова склеиваются
const clean = (text: string) => [...text].map(ch => (ch < ' ' ? ' ' : ch)).filter(ch => ch.codePointAt(0)! <= 0xffff).join('').replace(/\s+/g, ' ').trim()

export function parseReply(raw: string): { mood: Mood; text: string } {
  const match = /^\s*\[([^\]]+)\]\s*/.exec(raw)
  const mood = match ? MOOD_TAGS[match[1].trim().toLowerCase()] : undefined
  let text = clean(match ? raw.slice(match[0].length) : raw)
  if ([...text].length > MAX_REPLY_CHARS) text = [...text].slice(0, MAX_REPLY_CHARS - 1).join('').trimEnd() + '…'
  return { mood: mood ?? 'neutral', text: text || '…' }
}

export function remember(history: readonly Turn[], said: string, reply: string): Turn[] {
  return [...history, { who: 'user' as const, text: said }, { who: 'chan' as const, text: reply }].slice(-MEMORY_TURNS)
}

export function parseHistory(value: unknown): Turn[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((t): t is Turn => !!t && typeof t === 'object' && (t.who === 'user' || t.who === 'chan') && typeof t.text === 'string')
    .slice(-MEMORY_TURNS)
}

// Готовые реплики на события: они бесплатные. Запрос к модели на каждое событие — это токены
// подписки, поэтому он только в болтливом режиме (/chan chatty on).
export type EventKind = 'hello' | 'turnStart' | 'turnDone' | 'toolFailed' | 'longTurn' | 'modelFailed'
export const CANNED: Record<EventKind, { mood: Mood; lines: readonly string[] }> = {
  hello: { mood: 'happy', lines: ['Привет! Я тут, над строкой ввода. Напиши мне: /chan и что-нибудь.', 'О, меня позвали! Чем займёмся?', 'Я проснулась. Рассказывай, что сегодня чиним.'] },
  turnStart: { mood: 'thinking', lines: ['Большой Claude задумался. Я пока посторожу.', 'Так, работа пошла. Не дышу.', 'Хм-хм, интересно, что он там найдёт.'] },
  turnDone: { mood: 'happy', lines: ['Готово! Загляни в ответ.', 'Он закончил. Кажется, получилось.', 'Сделано. Что дальше?'] },
  toolFailed: { mood: 'worried', lines: ['Ой. Там что-то упало.', 'Красненькое в выводе… держись.', 'Команда вернула ошибку. Сейчас разберётся.'] },
  longTurn: { mood: 'sleepy', lines: ['Долго он… я немного подремлю.', 'Минута прошла. Можно успеть за чаем.'] },
  modelFailed: { mood: 'worried', lines: ['Я не смогла ответить: модель недоступна. Попробуй ещё раз чуть позже.'] },
}

// pick — число в [0, 1): случайность снаружи, чтобы функцию можно было проверить
export function canned(kind: EventKind, pick: number): { mood: Mood; text: string } {
  const { mood, lines } = CANNED[kind]
  return { mood, text: lines[Math.min(lines.length - 1, Math.floor(pick * lines.length))] }
}
