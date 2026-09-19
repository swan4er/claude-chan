// Тесты хуков в окружении движка. Запуск: claude plugin test .
// Модель подменена: настоящих запросов (и токенов) здесь нет.
import type { On, RenderElement } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

// что движок рисует в полосе сам, «под» плагином
const BENEATH: RenderElement = { type: 'Text', children: [''] }
// что нарисовали соседние моды; тест может подменить
let neighbour: RenderElement = BENEATH
const run = (args: string) => ({ command: 'chan', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const
// полноэкранный режим: maxRows — место, которое осталось полосе
const band = (maxRows: number, bodyColumns = 120) => ({
  component: 'AbovePrompt',
  viewport: { columns: bodyColumns, rows: (maxRows + 6) * 2, isFullscreen: true },
  props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
}) as const

// ответ модели приходит после возврата из команды: даём отработать цепочке промисов
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

function world(on: On, stored: Record<string, unknown> = {}, reply = '[радость] Привет! Я рада тебя видеть.') {
  const asked: { system?: string; prompt: string; model: string }[] = []
  mock.clock(on)
  on('store.get', ($, e) => ({ value: stored[e.key] }))
  on('store.set', ($, e) => {
    stored[e.key] = e.value
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  neighbour = BENEATH
  on('ui.render', { component: 'AbovePrompt' }, () => neighbour)
  on('model.complete', ($, e) => {
    asked.push({ system: e.system, prompt: e.prompt, model: e.model })
    return { value: reply }
  })
  return { stored, asked }
}

describe('register', () => {
  test('/chan показывает Claude-чан с приветствием и полем ввода, /chan off прячет', async ($, on) => {
    const { stored } = world(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const shown = await $.command.run(run(''))
    expect(shown.text).toContain('Claude-чан здесь')
    expect(stored.open).toBe(true)

    const ui = await $.ui.mount({ plugin: 'claude-chan', surface: 'terminal', ...band(19) })
    expect(await ui.find({ type: 'Text', text: /^Claude-чан$/ })).toBeDefined()
    expect(await ui.find({ key: 'say' })).toBeDefined()
    expect(await ui.findAll({ type: 'Text', text: /█|▀/ })).not.toHaveLength(0)
    await ui.unmount()

    const hidden = await $.command.run(run('off'))
    expect(hidden.text).toContain('спряталась')
    expect(stored.open).toBe(false)
  })

  test('/chan <текст> спрашивает модель с характером и памятью, ответ попадает в бабл и в хранилище', async ($, on) => {
    const { stored, asked } = world(on, { history: [{ who: 'user', text: 'как дела?' }, { who: 'chan', text: 'Отлично!' }] })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.command.run(run('Расскажи про Майнкрафт'))
    await settle()

    expect(asked).toHaveLength(1)
    expect(asked[0].model).toBe('haiku')
    expect(asked[0].system).toContain('Claude-чан')
    expect(asked[0].prompt).toContain('Программист: как дела?')
    expect(asked[0].prompt).toContain('Программист: Расскажи про Майнкрафт')
    expect(stored.open).toBe(true)
    const history = stored.history as { who: string; text: string }[]
    expect(history.at(-1)).toEqual({ who: 'chan', text: 'Привет! Я рада тебя видеть.' })
    expect(history.at(-2)).toEqual({ who: 'user', text: 'Расскажи про Майнкрафт' })
  })

  test('поле ввода: Enter отправляет реплику модели, пустая строка — нет', async ($, on) => {
    const { asked } = world(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.command.run(run(''))
    const ui = await $.ui.mount({ plugin: 'claude-chan', surface: 'terminal', ...band(19) })
    await ui.input({ key: 'say', text: '   ' })
    expect(asked).toHaveLength(0)
    await ui.input({ key: 'say', text: 'привет из поля' })
    await settle()
    expect(asked).toHaveLength(1)
    expect(asked[0].prompt).toContain('Программист: привет из поля')
    await ui.unmount()
  })

  test('«чан, …» в обычной строке ввода уходит ей, а не Claude; обычный промпт проходит дальше', async ($, on) => {
    const { asked, stored } = world(on)
    const entered: string[] = []
    on('prompt.submit', ($, e) => {
      entered.push(e.text)
      return { text: e.text }
    })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

    const mine = await $.prompt.submit({ text: 'чан, как тебе Майнкрафт?', wait: false, origin: { kind: 'composer' } })
    await settle()
    expect('drop' in mine).toBe(true)
    expect(entered).toEqual([])
    expect(asked).toHaveLength(1)
    expect(asked[0].prompt).toContain('Программист: как тебе Майнкрафт?')
    expect(stored.open).toBe(true)

    const other = await $.prompt.submit({ text: 'почини тест в чанке', wait: false, origin: { kind: 'composer' } })
    expect('drop' in other).toBe(false)
    expect(entered).toEqual(['почини тест в чанке'])
    // чужая сессия написала «чан, …» — это не человек за клавиатурой, не перехватываем
    await $.prompt.submit({ text: 'чан, привет', wait: false, origin: { kind: 'peer' } } as never)
    expect(entered).toHaveLength(2)
    expect(asked).toHaveLength(1)
  })

  test('размер портрета — по месту: высокая полоса даёт крупный из четвертинок, иначе малый из полублоков', async ($, on) => {
    world(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.command.run(run(''))
    const QUADS = /[▘▝▖▗▚▞▙▛▜▟]/
    for (const [size, large] of [[band(19), true], [band(15), true], [band(14), false], [band(11), false], [band(19, 60), false]] as const) {
      const ui = await $.ui.mount({ plugin: 'claude-chan', surface: 'terminal', ...size })
      const quads = await ui.findAll({ type: 'Text', text: QUADS })
      expect(quads.length > 0).toBe(large)
      expect(await ui.find({ key: 'say' })).toBeDefined()
      await ui.unmount()
    }
    // обычный экран: maxRows — вся высота окна, полоса берёт не больше половины
    for (const [rows, large, face] of [[24, false, false], [36, true, false], [20, false, true]] as const) {
      const ui = await $.ui.mount({ plugin: 'claude-chan', surface: 'terminal', ...band(rows), viewport: { columns: 120, rows, isFullscreen: false } })
      expect((await ui.findAll({ type: 'Text', text: QUADS })).length > 0).toBe(large)
      expect((await ui.find({ type: 'Text', text: /Claude-чан \(/ })) !== undefined).toBe(face)
      await ui.unmount()
    }
  })

  test('полоса общая: Claude-чан уступает соседу — портрет мельче, строка, а под игрой во всю полосу скрыта', async ($, on) => {
    world(on)
    const game = (height: number) => ({ type: 'Box', props: { flexDirection: 'column' }, children: [{ type: 'Box', props: { height }, children: [] }] }) as unknown as RenderElement
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.command.run(run(''))
    const QUADS = /[▘▝▖▗▚▞▙▛▜▟]/
    // [занято соседом, крупный, малый (есть поле ввода), строка со смайликом]
    for (const [rows, large, small, face] of [[19, false, false, false], [16, false, false, true], [7, false, true, false], [2, true, false, false]] as const) {
      neighbour = game(rows)
      const ui = await $.ui.mount({ plugin: 'claude-chan', surface: 'terminal', ...band(19) })
      expect((await ui.findAll({ type: 'Text', text: QUADS })).length > 0).toBe(large)
      expect((await ui.find({ key: 'say' })) !== undefined).toBe(large || small)
      expect((await ui.find({ type: 'Text', text: /Claude-чан \(/ })) !== undefined).toBe(face)
      await ui.unmount()
    }
  })

  test('в низком или узком окне — одна строка со смайликом вместо портрета', async ($, on) => {
    world(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.command.run(run(''))
    for (const size of [band(6), band(19, 40)]) {
      const ui = await $.ui.mount({ plugin: 'claude-chan', surface: 'terminal', ...size })
      expect(await ui.find({ type: 'Text', text: /Claude-чан \(\^‿\^\)/ })).toBeDefined()
      expect(await ui.find({ key: 'say' })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('настройки: chatty и reset; события по умолчанию модель не зовут', async ($, on) => {
    const { stored, asked } = world(on, { open: true, history: [{ who: 'user', text: 'а' }, { who: 'chan', text: 'б' }] })
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', ($, e) => ({ text: e.answer }))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

    await $.turn.start({ turnId: 't1', text: 'почини тест' })
    await $.turn.complete({ turnId: 't1', answer: 'готово', durationMs: 1200, isAborted: false, reason: 'answer' })
    await settle()
    expect(asked).toHaveLength(0)

    expect((await $.command.run(run('chatty on'))).text).toContain('включён')
    expect(stored.chatty).toBe(true)
    expect((await $.command.run(run('reset'))).text).toContain('очищена')
    expect(stored.history).toEqual([])
  })
})
