/* @jsx h */
import type { EngineInterface, Register, Timer } from 'claude-code'
import { bandRoom, companionRoom } from './band.ts'
import { isBlinking, isTyping, mouthOpen, typedCount, visibleLines } from './chan/bubble.ts'
import { SYSTEM, addressed, buildPrompt, canned, eventPrompt, parseHistory, parseReply, remember, type EventKind, type Turn } from './chan/persona.ts'
import { LARGE_COLUMNS, LARGE_MIN_ROWS, LARGE_ROWS, largePortrait } from './chan/large.ts'
import { WIDTH, portrait, type Mood } from './chan/portrait.ts'

// Модуль хуков. Claude-чан живёт в полосе над строкой ввода: портрет из цветных полублоков, бабл с
// репликой, поле ввода. Говорить с ней можно прямо в обычной строке ввода — «чан, привет» (хук
// prompt.submit забирает такую строку себе), командой `/chan <текст>` или через поле ввода
// (фокус — ctrl+x tab, обратно — Esc; мышь не нужна). Отвечает модель через $.model.complete:
// отдельный процесс Claude не запускается. На события (ход начался, закончился, команда упала) она
// реагирует готовыми фразами — они бесплатные; запрос к модели на события включает `/chan chatty on`.
//
// Вся отрисовка — здесь, без Client-поверхности: быстрый цикл не нужен, а так мод не зависит от мыши
// и полноэкранного режима. Ответы команды движок сам подписывает именем плагина.

// псевдоним, а не полный идентификатор: переживает смену версий модели
const MODEL = 'haiku'
const REPLY_TOKENS = 220
const ORANGE = '#d77814'
// портрет 9 строк + поле ввода + подсказка
const FULL_ROWS = 11
const FULL_COLUMNS = 56
const BUBBLE_LINES = 5
// крупный портрет: от 13 до 16 строк (снизу обрезаются плечи) + поле ввода + подсказка
const LARGE_BAND_ROWS = LARGE_MIN_ROWS + 2
const LARGE_BAND_COLUMNS = 68
const LARGE_BUBBLE_LINES = 7
const FRAME_MS = 140
const LONG_TURN_MS = 60_000
const TOOL_FAIL_QUIET_MS = 20_000
// ответ на реплику человека события не перебивают, пока он его читает
const READ_MS = 7000

const FACE: Record<Mood, string> = {
  neutral: '(•‿•)', happy: '(^‿^)', thinking: '(•_•)…', worried: '(>_<)', sleepy: '(-_-) zZ', surprised: '(o_o)',
}

let open = false
let chatty = false
let history: Turn[] = []
let mood: Mood = 'neutral'
let line = ''
let lineAt = 0
// до этого момента события молчат
let holdUntil = 0
let busy = false
// номер запроса: опоздавший ответ на старый вопрос отбрасывается
let seq = 0
let timer: Timer | undefined
let lastFrame = ''
let turnStartedAt: number | undefined
let longSaid = false
let lastToolFail = 0

type $ = EngineInterface

const keep = ($: $, key: string, value: unknown) =>
  $.store.set(key, value).catch(err => $.ui.log(`claude-chan: не сохранено (${key}): ${err}`))

// что сейчас на экране; таймер перерисовывает, только когда это изменилось
function frameKey(now: number): string {
  const elapsed = now - lineAt
  return `${typedCount(line, elapsed)}:${isTyping(line, elapsed) && mouthOpen(elapsed)}:${isBlinking(now)}`
}

function animate($: $): void {
  if (timer) return
  timer = $.clock.every(FRAME_MS, () => {
    if (!open) {
      timer?.cancel()
      timer = undefined
      return
    }
    const now = Date.now()
    if (turnStartedAt !== undefined && !longSaid && now - turnStartedAt > LONG_TURN_MS) {
      longSaid = true
      react($, 'longTurn')
    }
    const key = frameKey(now)
    if (key === lastFrame) return
    lastFrame = key
    $.ui.invalidate('ui.render')
  })
}

function say($: $, next: { mood: Mood; text: string }, hold = 0): void {
  mood = next.mood
  line = next.text
  lineAt = Date.now()
  holdUntil = hold ? lineAt + (([...line].length / 45) * 1000) + hold : 0
  animate($)
  $.ui.invalidate('ui.render')
}

// запрос к модели; event — реакция на событие, а не реплика человека (в память не идёт)
function ask($: $, said: string, event = false): void {
  const mine = ++seq
  busy = true
  say($, { mood: 'thinking', text: '…' })
  $.model
    .complete({ model: MODEL, system: SYSTEM, prompt: event ? eventPrompt(said) : buildPrompt(history, said), maxTokens: REPLY_TOKENS })
    .then(raw => {
      if (mine !== seq) return
      const reply = parseReply(raw)
      if (!event) {
        history = remember(history, said, reply.text)
        void keep($, 'history', history)
      }
      say($, reply, event ? 0 : READ_MS)
    })
    .catch(err => {
      $.ui.log(`claude-chan: модель не ответила: ${err}`)
      if (mine === seq) say($, canned('modelFailed', 0))
    })
    .finally(() => {
      if (mine === seq) busy = false
    })
}

function react($: $, kind: EventKind, detail?: string): void {
  if (!open || busy || Date.now() < holdUntil) return
  if (chatty && detail && (kind === 'turnDone' || kind === 'toolFailed')) ask($, detail, true)
  else say($, canned(kind, Math.random()))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    // непойманный отказ здесь выгрузил бы весь модуль: хранилище стоит памяти, но не самой Claude-чан
    const read = (key: string) => $.store.get(key).catch(err => { $.ui.log(`claude-chan: не прочитано (${key}): ${err}`); return undefined })
    history = parseHistory(await read('history'))
    chatty = (await read('chatty')) === true
    open = (await read('open')) === true
    await $.command.register({
      name: 'chan',
      description: 'Claude-чан над строкой ввода: показать или скрыть; /chan <текст> — сказать ей что-нибудь (claude-chan)',
      argumentHint: '[текст | off | chatty on|off | reset]',
      immediate: true,
    }).catch(err => $.ui.log(`claude-chan: /chan не зарегистрирована: ${err}`))
    if (open) say($, canned('hello', Math.random()))
    return r
  })

  on('command.run', { command: 'chan' }, async ($, e) => {
    const text = e.args.trim()
    const [cmd = '', arg = ''] = text.toLowerCase().split(/\s+/)
    const show = (value: boolean) => {
      open = value
      void keep($, 'open', open)
      $.ui.invalidate('ui.render')
    }
    if (text === '') {
      show(!open)
      if (open) say($, canned('hello', Math.random()))
      return { text: open ? 'Claude-чан здесь · /chan <текст> — сказать ей что-нибудь · ctrl+x tab — поле ввода · /chan off — скрыть' : 'Claude-чан спряталась' }
    }
    if (cmd === 'off') {
      show(false)
      return { text: 'Claude-чан спряталась' }
    }
    if (cmd === 'chatty' && (arg === 'on' || arg === 'off' || arg === '')) {
      if (arg) chatty = arg === 'on'
      void keep($, 'chatty', chatty)
      return { text: chatty ? 'болтливый режим включён: на завершение хода и ошибки отвечает модель (это токены)' : 'болтливый режим выключен: на события — готовые фразы, модель только по вашей реплике' }
    }
    if (cmd === 'reset' && arg === '') {
      history = []
      void keep($, 'history', history)
      if (open) say($, { mood: 'surprised', text: 'Ой! Я всё забыла. Начнём заново?' })
      return { text: 'память разговора очищена' }
    }
    if (!open) show(true)
    ask($, text)
    return {}
  })

  // «чан, …» в обычной строке ввода — реплика ей, а не большому Claude: строка до модели не доходит
  on('prompt.submit', async ($, e, next) => {
    // только то, что человек набрал сам: сообщения других сессий, плагинов и расписаний не перехватываются
    const said = e.origin.kind === 'composer' ? addressed(e.text) : undefined
    if (said === undefined) return next(e)
    if (!open) {
      open = true
      void keep($, 'open', open)
    }
    ask($, said)
    // движок печатает причину в переписке («Prompt dropped by a hook: …») — убрать это нельзя, поэтому коротко
    return { drop: '→ Claude-чан' }
  })

  on('turn.start', async ($, e, next) => {
    turnStartedAt = Date.now()
    longSaid = false
    react($, 'turnStart')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    turnStartedAt = undefined
    // в болтливом режиме она комментирует конец ответа большого Claude
    const detail = chatty && e.answer ? `большой Claude закончил ход. Конец его ответа: «${e.answer.slice(-400)}»` : undefined
    react($, 'turnDone', detail)
    return r
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    const now = Date.now()
    if (open && !('deny' in r) && r.isError && now - lastToolFail > TOOL_FAIL_QUIET_MS) {
      lastToolFail = now
      react($, 'toolFailed', `инструмент ${e.tool} вернул ошибку`)
    }
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // опрос занимает полосу сам
    if (!open || e.props.hasSurvey) return next(e)
    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const now = Date.now()
    const elapsed = now - lineAt
    const typing = isTyping(line, elapsed)

    // Полоса общая с другими модами (см. ./band.ts): Claude-чан — компаньон, она уступает. Сначала рисуют
    // соседи, ей остаётся остальное: крупный портрет → малый → одна строка → совсем скрыта.
    const beneath = await next(e)
    const room = companionRoom(bandRoom(e.props.maxRows, e.viewport), beneath)
    if (room < 1) return beneath

    // мало места: одна строка с лицом-смайликом вместо портрета
    if (room < FULL_ROWS || e.props.bodyColumns < FULL_COLUMNS) {
      return (
        <Box flexDirection="column">
          <Text wrap="truncate-end"><Text color={ORANGE} bold>{`Claude-чан ${FACE[mood]} `}</Text>{visibleLines(line, elapsed, 400, 1)[0] ?? ''}</Text>
          {beneath}
        </Box>
      )
    }

    // высокое окно — крупный портрет из четвертинок клетки, иначе малый из полублоков
    const large = room >= LARGE_BAND_ROWS && e.props.bodyColumns >= LARGE_BAND_COLUMNS
    const columns = large ? LARGE_COLUMNS : WIDTH
    const bubbleLines = large ? LARGE_BUBBLE_LINES : BUBBLE_LINES
    const bubbleWidth = Math.max(30, Math.min(64, e.props.bodyColumns - columns - 4))
    const lines = visibleLines(line, elapsed, bubbleWidth - 4, bubbleLines)
    const pose = { mood, blink: isBlinking(now), talk: typing && mouthOpen(elapsed) }
    const rows = large ? largePortrait(pose, Math.min(LARGE_ROWS, room - 2)) : portrait(pose)
    // поле ввода есть не на каждой поверхности (на мобильной его нет)
    const Input = 'Input' in table ? table.Input : undefined
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Box flexDirection="column" width={columns}>
            {rows.map(row => (
              <Text>{row.map(run => (run.bg ? <Text color={run.fg} backgroundColor={run.bg}>{run.text}</Text> : run.fg ? <Text color={run.fg}>{run.text}</Text> : <Text>{run.text}</Text>))}</Text>
            ))}
          </Box>
          <Box flexDirection="column" marginLeft={2}>
            <Text color={ORANGE} bold>{'Claude-чан'}</Text>
            <Box flexDirection="column" borderStyle="round" borderColor={ORANGE} width={bubbleWidth} height={bubbleLines + 2} paddingX={1}>
              {lines.map(text => <Text wrap="truncate-end">{text}</Text>)}
            </Box>
          </Box>
        </Box>
        {Input ? <Input key="say" placeholder="поле Claude-чан: ctrl+x tab — сюда, Esc — обратно к Claude · проще: начните обычную строку с «чан, »" onSubmit={value => { if (value.trim()) ask($, value.trim()) }} /> : null}
        <Text dimColor wrap="truncate-end">{`«чан, …» в строке ввода — сказать ей · /chan off — скрыть · /chan chatty ${chatty ? 'off' : 'on'} — ${chatty ? 'тише' : 'болтливее'} · /chan reset — забыть разговор`}</Text>
        {beneath}
      </Box>
    )
  })
}
