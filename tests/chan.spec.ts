// Тесты чистой логики. Запуск: node --test "tests/**/*.spec.ts" (node 24 исполняет .ts сам).
// Расширение .spec.ts, а не .test.ts: *.test.ts подбирает `claude plugin test`.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { CHARS_PER_SECOND, isBlinking, isTyping, mouthOpen, typedCount, visibleLines, wrap } from '../hooks/chan/bubble.ts'
import {
  CANNED, MAX_REPLY_CHARS, addressed, MEMORY_TURNS, MOOD_TAGS, SYSTEM, buildPrompt, canned, eventPrompt, parseHistory, parseReply, remember, type EventKind,
} from '../hooks/chan/persona.ts'
import { LARGE_BASE, LARGE_COLUMNS, LARGE_HEIGHT, LARGE_MIN_ROWS, LARGE_ROWS, LARGE_WIDTH, composeLarge, largePortrait } from '../hooks/chan/large.ts'
import { overloadedCells, toCells, toQuadRuns } from '../hooks/chan/quad.ts'
import { HEIGHT, PALETTE, WIDTH, compose, portrait, shownIn256, toRuns, type Mood, type Rgb } from '../hooks/chan/portrait.ts'

const MOODS: Mood[] = ['neutral', 'happy', 'thinking', 'worried', 'sleepy', 'surprised']
const width = (s: string) => [...s].length

describe('крупный портрет', () => {
  const POSES = MOODS.flatMap(mood => [false, true].flatMap(blink => [false, true].map(talk => ({ mood, blink, talk }))))

  test('любая поза — LARGE_HEIGHT × LARGE_WIDTH, только символы палитры; основа симметрична по ширине', () => {
    for (const pose of POSES) {
      const map = composeLarge(pose)
      assert.equal(map.length, LARGE_HEIGHT)
      for (const row of map) {
        assert.equal(row.length, LARGE_WIDTH)
        for (const ch of row) assert.ok(ch === '.' || ch in PALETTE, `символ «${ch}»`)
      }
    }
    assert.equal(LARGE_HEIGHT % 2, 0)
    assert.equal(LARGE_WIDTH % 2, 0)
  })

  test('выражения различаются; моргание и речь меняют картинку', () => {
    assert.equal(new Set(MOODS.map(mood => composeLarge({ mood }).join('\n'))).size, MOODS.length)
    for (const mood of MOODS) assert.notDeepEqual(composeLarge({ mood }), composeLarge({ mood, talk: true }), mood)
    assert.notDeepEqual(composeLarge({ mood: 'neutral' }), composeLarge({ mood: 'neutral', blink: true }))
    assert.deepEqual(composeLarge({ mood: 'sleepy' }), composeLarge({ mood: 'sleepy', blink: true }))
  })

  test('лицо помещается в два цвета на клетку: наклейки не теряют точек, основа теряет мало', () => {
    const base = overloadedCells(LARGE_BASE)
    assert.ok(base <= 25, `в основе упрощено клеток: ${base}`)
    // глаза, брови, рот и румянец нарисованы по сетке клеток: лишних упрощений они не добавляют
    for (const pose of POSES) assert.ok(overloadedCells(composeLarge(pose)) <= base + 1, JSON.stringify(pose))
  })

  test('отрезки: LARGE_ROWS строк по LARGE_COLUMNS клеток; обрезка снизу не трогает лицо', () => {
    for (const pose of POSES) {
      const rows = largePortrait(pose)
      assert.equal(rows.length, LARGE_ROWS)
      for (const row of rows) assert.equal(row.reduce((n, r) => n + width(r.text), 0), LARGE_COLUMNS)
    }
    const full = largePortrait({ mood: 'happy' })
    assert.deepEqual(largePortrait({ mood: 'happy' }, LARGE_MIN_ROWS), full.slice(0, LARGE_MIN_ROWS))
    // меньше минимума не режет: лицо важнее
    assert.equal(largePortrait({ mood: 'happy' }, 3).length, LARGE_MIN_ROWS)
    // рот (строки 20–21) и подбородок (до 23-й) — в пределах минимальной высоты
    assert.ok(composeLarge({ mood: 'happy' })[21].includes('M'))
    assert.ok(LARGE_MIN_ROWS * 2 >= 24)
  })

  test('четвертинки: символ по маске, два цвета на клетку, третий уходит в ближайший', () => {
    assert.deepEqual(toQuadRuns(['H.', '.H']), [[{ text: '▚', fg: '#d77814', bg: undefined }]])
    assert.deepEqual(toQuadRuns(['HHSS', 'HHSS']), [[{ text: '█', fg: '#d77814', bg: undefined }, { text: '█', fg: '#ffd7af', bg: undefined }]])
    assert.deepEqual(toQuadRuns(['HS', 'HS']), [[{ text: '▌', fg: '#d77814', bg: '#ffd7af' }]])
    // H, H, S и тень кожи s: s ближе к S, чем к волосам
    const [[cell]] = toCells(['HH', 'Ss'])
    assert.deepEqual(cell, { glyph: '▀', fg: '#d77814', bg: '#ffd7af' })
    assert.equal(overloadedCells(['HH', 'Ss']), 1)
  })

  test('новые цвета не слипаются с соседями в палитре 256', () => {
    const shown = (k: string) => shownIn256(PALETTE[k]).join(',')
    for (const [a, b] of [['D', 'H'], ['D', 'h'], ['i', 'e'], ['i', 'W'], ['R', 'M'], ['M', 'C'], ['s', 'D']]) {
      assert.notEqual(shown(a), shown(b), `${a} и ${b} слиплись в ${shown(a)}`)
    }
  })
})

describe('портрет', () => {
  test('любая поза — ровно HEIGHT × WIDTH, только символы палитры', () => {
    for (const mood of MOODS) for (const blink of [false, true]) for (const talk of [false, true]) {
      const map = compose({ mood, blink, talk })
      assert.equal(map.length, HEIGHT)
      for (const row of map) {
        assert.equal(row.length, WIDTH)
        for (const ch of row) assert.ok(ch === '.' || ch in PALETTE, `символ «${ch}»`)
      }
    }
    assert.equal(HEIGHT % 2, 0)
  })

  test('выражения различаются; моргание и речь меняют картинку', () => {
    const seen = new Set(MOODS.map(mood => compose({ mood }).join('\n')))
    assert.equal(seen.size, MOODS.length)
    assert.notDeepEqual(compose({ mood: 'neutral' }), compose({ mood: 'neutral', blink: true }))
    assert.notDeepEqual(compose({ mood: 'neutral' }), compose({ mood: 'neutral', talk: true }))
    // у спящей и у счастливой глаза и так закрыты: моргание ничего не меняет
    assert.deepEqual(compose({ mood: 'sleepy' }), compose({ mood: 'sleepy', blink: true }))
  })

  test('отрезки: HEIGHT / 2 строк по WIDTH клеток; прозрачное остаётся без цвета', () => {
    for (const mood of MOODS) {
      const rows = portrait({ mood })
      assert.equal(rows.length, HEIGHT / 2)
      for (const row of rows) assert.equal(row.reduce((n, r) => n + width(r.text), 0), WIDTH)
    }
    assert.deepEqual(toRuns(['HH..', 'H.H.']), [[
      { text: '█', fg: '#d77814' },
      { text: '▀', fg: '#d77814' },
      { text: '▄', fg: '#d77814' },
      { text: ' ' },
    ]])
  })

  test('палитра переживает огрубление до 256 цветов: соседние цвета не слипаются, лицо не меняется', () => {
    const shown = (k: string) => shownIn256(PALETTE[k]).join(',')
    // то, что на лице рядом, должно остаться различимым
    for (const [a, b] of [['H', 'h'], ['H', 'L'], ['H', 'S'], ['S', 's'], ['S', 'B'], ['S', 'M'], ['E', 'e'], ['e', 'W'], ['C', 'c'], ['C', 'S'], ['P', 'H']]) {
      assert.notEqual(shown(a), shown(b), `${a} и ${b} слиплись в ${shown(a)}`)
    }
    // светлые цвета взяты из ступеней, которые округление не трогает
    for (const k of ['S', 'B', 'W', 'C', 'c', 'P', 'E']) assert.deepEqual(shownIn256(PALETTE[k]), PALETTE[k] as Rgb, k)
    // остальные уходят недалеко: не больше 60 на канал
    for (const [k, c] of Object.entries(PALETTE)) {
      const s = shownIn256(c)
      assert.ok(c.every((v, i) => Math.abs(v - s[i]) <= 60), `${k}: ${c} → ${s}`)
    }
  })
})

describe('бабл', () => {
  test('перенос по словам, длинное слово режется, ничего не теряется', () => {
    assert.deepEqual(wrap('раз два три четыре', 8), ['раз два', 'три', 'четыре'])
    assert.deepEqual(wrap('абвгдежзиклмн', 5), ['абвгд', 'ежзик', 'лмн'])
    assert.deepEqual(wrap('', 10), [])
    const text = 'Вау, в терминале?! Это же надо было немало кода намотать, чтобы блоки рендерились.'
    for (const w of [10, 24, 60]) {
      const lines = wrap(text, w)
      for (const l of lines) assert.ok(width(l) <= w)
      // слова короче строки не режутся — склейка возвращает исходный текст; при w = 10 режутся, но буквы те же
      if (w >= 12) assert.equal(lines.join(' '), text)
      assert.equal(lines.join('').replaceAll(' ', ''), text.replaceAll(' ', ''))
    }
  })

  test('печать по буквам: скорость, окончание, прокрутка длинного ответа', () => {
    const text = 'Привет, мир!'
    assert.equal(typedCount(text, 0), 0)
    assert.equal(typedCount(text, 1000), Math.min(width(text), CHARS_PER_SECOND))
    assert.ok(isTyping(text, 100))
    assert.ok(!isTyping(text, 5000))
    const long = Array.from({ length: 40 }, (_, i) => `слово${i}`).join(' ')
    const lines = visibleLines(long, 60_000, 20, 5)
    assert.equal(lines.length, 5)
    assert.ok(lines[4].endsWith('слово39'))
    assert.deepEqual(visibleLines('', 1000, 20, 5), [])
  })

  test('рот открывается и закрывается, моргание короткое и редкое', () => {
    assert.notEqual(mouthOpen(0), mouthOpen(150))
    let closed = 0
    for (let t = 0; t < 42_000; t += 10) if (isBlinking(t)) closed++
    assert.ok(closed / 4200 > 0.02 && closed / 4200 < 0.08, `закрыты ${(closed / 42).toFixed(1)} % времени`)
  })
})

describe('характер', () => {
  test('системный промпт перечисляет все теги настроения и лимит длины', () => {
    for (const tag of Object.keys(MOOD_TAGS)) assert.ok(SYSTEM.includes(`[${tag}]`))
    assert.ok(SYSTEM.includes(String(MAX_REPLY_CHARS)))
    assert.deepEqual([...new Set(Object.values(MOOD_TAGS))].sort(), [...MOODS].sort())
  })

  test('разбор ответа: тег → лицо, эмодзи и переводы строк убраны, длина ограничена', () => {
    assert.deepEqual(parseReply('[тревога] Не сдавайся! 💪 Разберёмся.'), { mood: 'worried', text: 'Не сдавайся! Разберёмся.' })
    assert.deepEqual(parseReply('  [ Радость ]\nУра!\nПолучилось.'), { mood: 'happy', text: 'Ура! Получилось.' })
    assert.deepEqual(parseReply('Без тега тоже ответ.'), { mood: 'neutral', text: 'Без тега тоже ответ.' })
    assert.deepEqual(parseReply('[выдуманное] Текст'), { mood: 'neutral', text: 'Текст' })
    assert.deepEqual(parseReply('[радость]'), { mood: 'happy', text: '…' })
    const long = parseReply('[радость] ' + 'очень '.repeat(100))
    assert.ok(width(long.text) <= MAX_REPLY_CHARS)
    assert.ok(long.text.endsWith('…'))
  })

  test('память короткая: в запрос и в хранилище идут только последние реплики', () => {
    let history = parseHistory(undefined)
    for (let i = 0; i < 10; i++) history = remember(history, `вопрос ${i}`, `ответ ${i}`)
    assert.equal(history.length, MEMORY_TURNS)
    assert.equal(history.at(-1)?.text, 'ответ 9')
    const prompt = buildPrompt(history, 'а теперь?')
    assert.ok(prompt.includes('Программист: вопрос 9'))
    assert.ok(!prompt.includes('вопрос 3'))
    assert.ok(prompt.endsWith('Программист: а теперь?\nClaude-чан:'))
    assert.ok(!buildPrompt([], 'привет').includes('Недавний разговор'))
    assert.ok(eventPrompt('тесты упали').includes('тесты упали'))
  })

  test('обращение по имени в обычной строке ввода', () => {
    assert.equal(addressed('чан, как дела?'), 'как дела?')
    assert.equal(addressed('Чан как дела'), 'как дела')
    assert.equal(addressed('chan: hello there'), 'hello there')
    assert.equal(addressed('  ч что думаешь?'), 'что думаешь?')
    assert.equal(addressed('Claude-чан, привет'), 'привет')
    assert.equal(addressed('тян, ты тут?'), 'ты тут?')
    // не обращение: слово просто начинается так же, имя без реплики, команда, многострочный промпт
    for (const text of ['чанга — это музыка', 'change the config', 'чан', 'чан,  ', '/chan привет', 'чан, смотри:\nкод', 'почини чан', 'channel settings'])
      assert.equal(addressed(text), undefined, text)
  })

  test('испорченная память не роняет мод', () => {
    assert.deepEqual(parseHistory('чушь'), [])
    assert.deepEqual(parseHistory([{ who: 'user', text: 'ок' }, { who: 'бот', text: 'x' }, null, { who: 'chan' }, { who: 'chan', text: 'да' }]), [
      { who: 'user', text: 'ок' },
      { who: 'chan', text: 'да' },
    ])
  })

  test('готовые реплики: на каждое событие есть фразы без эмодзи, помещаются в бабл, выбор покрывает весь список', () => {
    for (const [kind, { lines }] of Object.entries(CANNED)) {
      assert.ok(lines.length > 0)
      for (const l of lines) {
        assert.ok(width(l) <= MAX_REPLY_CHARS)
        assert.deepEqual(parseReply(l).text, l, `«${l}» изменилась бы при очистке`)
      }
      const picked = new Set([0, 0.34, 0.67, 0.999].map(p => canned(kind as EventKind, p).text))
      assert.ok(picked.size >= Math.min(lines.length, 2))
      assert.equal(canned(kind as EventKind, 0.999).text, lines.at(-1))
    }
  })
})
