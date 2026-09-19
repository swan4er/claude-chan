// Портрет Claude-чан: пиксель-арт, который рисуется цветными полублоками (▀ — верхний пиксель
// цветом символа, нижний цветом фона), то есть 2 пикселя на клетку терминала. Работает в любом
// терминале с цветом: Windows Terminal, Terminal.app, терминал VS Code, tmux.
//
// Палитра подобрана под огрубление до 256 цветов. Terminal.app и tmux 24-битного цвета не дают, и
// Claude Code сам округляет каждый канал как round(v / 255 · 5) до ступеней 0, 95, 135, 175, 215,
// 255. Значения 0, 175, 215 и 255 при этом остаются собой, поэтому светлые цвета взяты из них —
// лицо выглядит одинаково везде; тёмные подобраны так, чтобы после округления не слиться.
// Серые (r = g = b) идут по отдельной шкале и почти не меняются. Проверяет это tests/portrait.spec.ts.

export type Rgb = readonly [number, number, number]
export type Mood = 'neutral' | 'happy' | 'thinking' | 'worried' | 'sleepy' | 'surprised'

export const PALETTE: Record<string, Rgb> = {
  H: [215, 120, 20], // волосы, рыжие — цвет Claude; в палитре 256 остаются оранжевыми (215, 135, 0)
  h: [175, 70, 0], // волосы в тени
  L: [255, 175, 60], // блик на волосах
  S: [255, 215, 175], // кожа
  s: [215, 175, 135], // кожа в тени
  B: [255, 175, 175], // румянец
  E: [0, 0, 0], // ресницы и зрачок
  e: [0, 110, 175], // радужка
  W: [255, 255, 255], // блик в глазу
  M: [215, 60, 60], // рот
  C: [255, 255, 215], // одежда
  c: [215, 215, 175], // одежда в тени
  K: [215, 120, 20], // бант
  P: [255, 255, 215], // заколка-искра
  // только в крупном портрете
  D: [120, 50, 0], // линии прядей и контур волос
  i: [0, 175, 215], // светлый низ радужки
  R: [175, 0, 0], // узел и тень банта
}

export const WIDTH = 16
export const HEIGHT = 18

// лицо без глаз, бровей и рта: их кладёт сверху выражение; '.' — прозрачно
const BASE: readonly string[] = [
  '......HHHH......',
  '....HHLLHHHH....',
  '...HHLLHHHHHH...',
  '..HHLHHHHHHPHH..',
  '..HHHHHHHHPPPH..',
  '.HHHhHHHHHhPHHH.',
  '.HHhSShHHhSSShH.',
  '.HHSSSSSSSSSSHH.',
  '.HHSSSSSSSSSSHH.',
  '.HHSSSSSSSSSSHH.',
  '.HHSSSSSSSSSSHH.',
  '.hHSSSSSSSSSSHh.',
  '..hHSSSSSSSSHh..',
  '..hhsSSSSSSshh..',
  '...h.sSSSSs.h...',
  '....CCKKKKCC....',
  '...CCCCKKCCCC...',
  '..CCCCcCCcCCCC..',
]

// наклейка: строки и место левого верхнего угла; ' ' в строке — не трогать то, что под ней
type Patch = { x: number; y: number; rows: readonly string[] }
const eyes = (left: readonly string[], right: readonly string[] = left): Patch[] => [
  { x: 3, y: 8, rows: left },
  { x: 10, y: 8, rows: right },
]
const mouth = (rows: readonly string[], x = 7): Patch => ({ x, y: 12, rows })
const brows = (left: string, right: string): Patch[] => [
  { x: 3, y: 7, rows: [left] },
  { x: 10, y: 7, rows: [right] },
]

const OPEN_EYE = ['EEE', 'eWE', 'eeE']
const CLOSED_EYE = ['   ', 'EEE', '   ']
const SMILE_EYE = ['   ', ' E ', 'E E']
const BLUSH: Patch[] = [{ x: 3, y: 11, rows: ['BB'] }, { x: 11, y: 11, rows: ['BB'] }]

const FACES: Record<Mood, { eyes: Patch[]; extra: Patch[]; mouth: Patch; talk: Patch }> = {
  neutral: { eyes: eyes(OPEN_EYE), extra: BLUSH, mouth: mouth(['MM']), talk: mouth(['MM', 'MM']) },
  happy: { eyes: eyes(SMILE_EYE), extra: BLUSH, mouth: mouth(['MMMM', ' MM '], 6), talk: mouth(['MMMM', 'MMMM'], 6) },
  thinking: { eyes: eyes(['EEE', 'WeE', 'eeE']), extra: [...brows('hhh', '   '), ...BLUSH], mouth: mouth(['M'], 9), talk: mouth(['MM'], 8) },
  worried: { eyes: eyes(OPEN_EYE), extra: brows('  h', 'h  '), mouth: mouth(['MM ', '  M'], 7), talk: mouth(['MM', 'MM']) },
  sleepy: { eyes: eyes(CLOSED_EYE), extra: BLUSH, mouth: mouth(['M'], 8), talk: mouth(['MM']) },
  surprised: { eyes: eyes(['EEE', 'eWe', 'eee']), extra: brows('hhh', 'hhh'), mouth: mouth(['MM', 'MM']), talk: mouth(['MM', 'MM']) },
}

export type Pose = { mood: Mood; blink?: boolean; talk?: boolean }

// карта символов палитры HEIGHT × WIDTH
export function compose(pose: Pose): string[] {
  const face = FACES[pose.mood]
  const grid = BASE.map(row => [...row])
  const paste = (p: Patch) =>
    p.rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
      if (ch !== ' ' && grid[p.y + dy]?.[p.x + dx] !== undefined) grid[p.y + dy][p.x + dx] = ch
    }))
  const closed = pose.blink && pose.mood !== 'happy' && pose.mood !== 'sleepy'
  ;(closed ? eyes(CLOSED_EYE) : face.eyes).forEach(paste)
  face.extra.forEach(paste)
  paste(pose.talk ? face.talk : face.mouth)
  return grid.map(row => row.join(''))
}

const hex = ([r, g, b]: Rgb) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')

// отрезок строки терминала: fg/bg — цвета; без bg нижний (или верхний) пиксель прозрачен
export type Run = { text: string; fg?: string; bg?: string }

// карта → строки отрезков полублоков; прозрачные пиксели остаются цветом фона терминала
export function toRuns(map: readonly string[]): Run[][] {
  const out: Run[][] = []
  for (let y = 0; y < map.length; y += 2) {
    const line: Run[] = []
    for (let x = 0; x < map[y].length; x++) {
      const top = PALETTE[map[y][x]]
      const bottom = PALETTE[map[y + 1]?.[x] ?? '.']
      const run: Run =
        top && bottom ? (map[y][x] === map[y + 1][x] ? { text: '█', fg: hex(top) } : { text: '▀', fg: hex(top), bg: hex(bottom) })
        : top ? { text: '▀', fg: hex(top) }
        : bottom ? { text: '▄', fg: hex(bottom) }
        : { text: ' ' }
      const last = line[line.length - 1]
      if (last && last.fg === run.fg && last.bg === run.bg && last.text[0] === run.text) last.text += run.text
      else line.push(run)
    }
    out.push(line)
  }
  return out
}

export const portrait = (pose: Pose): Run[][] => toRuns(compose(pose))

// как цвет покажет терминал на 256 цветов (то самое округление Claude Code) — для тестов и предпросмотра
export function shownIn256([r, g, b]: Rgb): Rgb {
  if (r === g && g === b) {
    if (r < 8) return [0, 0, 0]
    if (r > 248) return [255, 255, 255]
    const v = 8 + Math.round(((r - 8) / 247) * 24) * 10
    return [v, v, v]
  }
  const level = (v: number) => [0, 95, 135, 175, 215, 255][Math.round((v / 255) * 5)]
  return [level(r), level(g), level(b)]
}
