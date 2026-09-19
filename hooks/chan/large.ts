// Крупный портрет Claude-чан: 56×32 точки, 28×16 клеток из четвертинок (см. quad.ts).
//
// Основа (волосы, лицо, плечи) задана формулами — эллипсы и клинья прядей: так края выходят
// гладкими, а размер и пропорции меняются числами, а не перерисовкой сотен точек. Глаза, брови, рот
// и румянец — наклейки, нарисованные по точкам, как в малом портрете. Наклейки стоят на чётных
// координатах и внутри каждой клетки 2×2 держат не больше двух цветов — иначе quad.ts их огрубит.
//
// Координаты формул: u — в ширинах клетки (0…28), v — в половинах высоты клетки (0…32); в этих
// единицах картинка не искажена. Точка карты (x, y) — это u = x / 2, v = y.
import type { Mood, Pose, Run } from './portrait.ts'
import { toQuadRuns } from './quad.ts'

export const LARGE_WIDTH = 56
export const LARGE_HEIGHT = 32
export const LARGE_COLUMNS = LARGE_WIDTH / 2
export const LARGE_ROWS = LARGE_HEIGHT / 2
// строки клеток, ниже которых только плечи: портрет можно обрезать снизу до этой высоты
export const LARGE_MIN_ROWS = 13

const CU = 14
const ell = (u: number, v: number, cu: number, cv: number, ru: number, rv: number) => ((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2

// пряди чёлки: [вершина u, вершина v, крутизна]; волосы — всё, что выше огибающей
const STRANDS: readonly (readonly [number, number, number])[] = [
  [5, 17.5, 3.4], [23, 17.5, 3.4], // боковые, вдоль щёк
  [12.2, 12.2, 1.7], [16.4, 11.6, 1.7], // две над переносицей
  [14.4, 10.2, 2.4],
]
const fringe = (u: number) => Math.max(7.6, ...STRANDS.map(([tu, tv, k]) => tv - k * Math.abs(u - tu)))

// полуширина лица на высоте v: сверху эллипс, к подбородку сужается сильнее
function faceHalf(v: number): number {
  const t = (v - 14.5) / 8.5
  if (Math.abs(t) >= 1) return 0
  const w = 8.9 * Math.sqrt(1 - t * t)
  return t > 0 ? w * (1 - 0.22 * t * t) : w
}

// полуширина причёски на высоте v
function hairHalf(v: number): number {
  if (v < 1) return 0
  if (v <= 12) return 12.3 * Math.sqrt(Math.max(0, 1 - ((v - 12) / 11) ** 2))
  return 12.3 - 0.07 * (v - 12)
}

function pixel(u: number, v: number): string {
  const du = Math.abs(u - CU)
  const inHair = du < hairHalf(v)
  const inFace = du < faceHalf(v)
  const bang = inHair && v < fringe(u)

  // заколка-искра справа на чёлке: четырёхконечная звезда
  const pu = Math.abs(u - 20.6)
  const pv = Math.abs(v - 6)
  if (pu * 0.9 + pv < 1.4 && (pu < 0.55 || pv < 0.6) || (pu < 0.8 && pv < 0.9)) return 'P'

  // хохолок на макушке
  if (v < 3 && Math.abs(u - (15.2 + (3 - v) * 0.9)) < 0.55 + v * 0.12) return v < 1.2 ? 'L' : 'H'

  if (bang || (inHair && !inFace && v < 24)) {
    // блик — дуга поперёк макушки, разорванная линиями прядей
    const r = ell(u, v, CU, 12, 12.3, 11)
    const part = Math.abs(((u + 0.9) % 3.6) - 1.8)
    if (r > 0.4 && r < 0.6 && v < 7.6 && part > 0.5) return 'L'
    // линии прядей в чёлке
    if (bang && v > 7.5) for (const [tu, tv, k] of STRANDS) {
      const edge = tv - k * Math.abs(u - tu)
      if (v > edge - 0.9 && v <= edge + 0.2 && Math.abs(u - tu) > 0.8 && edge > 8.4) return 'D'
    }
    // тень у лица и внизу
    if (!bang && du < faceHalf(Math.min(v, 22)) + 1.6 && v > 14) return 'h'
    if (du > hairHalf(v) - 1 && v > 9) return 'h'
    return 'H'
  }

  if (inFace) {
    // тень от чёлки и под подбородком по краю
    if (v < fringe(u) + 1.1) return 's'
    return 'S'
  }

  // шея
  if (du < 2.3 && v >= 21 && v < 27) return v < 24.2 ? 's' : 'S'

  // плечи и воротник
  if (ell(u, v, CU, 35, 12.8, 10) < 1) {
    // вырез
    if (v < 28.4 && du < (28.4 - v) * 0.85) return 'S'
    // бант
    const bv = Math.abs(v - 29.2)
    if (du < 0.9 && bv < 1.1) return 'R'
    if (du < 3.8 && bv < du * 0.62 + 0.2) return du > 2.8 && bv > 1.3 ? 'R' : 'M'
    // отворот воротника
    if (du < (31.5 - v) * 1.35 + 1.4 && du > (31.5 - v) * 1.35 + 0.2 && v > 25) return 'c'
    if (ell(u, v, CU, 35, 12.8, 10) > 0.86) return 'c'
    return 'C'
  }

  // длинные волосы за плечами
  if (inHair) return du < hairHalf(v) - 1.2 ? 'h' : 'H'
  return '.'
}

// передние пряди поверх плеч: клин от щеки вниз
function lock(u: number, v: number): string | undefined {
  const du = Math.abs(u - CU)
  if (v < 20 || v > 30.5) return undefined
  const t = (v - 20) / 10.5
  const inner = 6.9 + t * 1.6
  const outer = 11.6 - t * 1.4
  if (du < inner || du > outer) return undefined
  if (Math.abs(du - (inner + outer) / 2) < 0.3 && v < 28) return 'D'
  return du < inner + 0.9 ? 'h' : 'H'
}

function drawBase(): string[] {
  const rows: string[] = []
  for (let y = 0; y < LARGE_HEIGHT; y++) {
    let row = ''
    for (let x = 0; x < LARGE_WIDTH; x++) {
      const u = (x + 0.5) / 2
      const v = y + 0.5
      row += lock(u, v) ?? pixel(u, v)
    }
    rows.push(row)
  }
  return rows
}

export const LARGE_BASE: readonly string[] = drawBase()

// наклейка: строки и левый верхний угол (чётные x и y); ' ' — не трогать то, что под ней
type Patch = { x: number; y: number; rows: readonly string[] }
const EYE_Y = 12
const LEFT_X = 14
const RIGHT_X = 32
const mirror = (rows: readonly string[]) => rows.map(r => [...r].reverse().join(''))
// правый глаз — зеркало левого, но блик остаётся с той же стороны: свет один
const eyes = (left: readonly string[], right: readonly string[] = mirror(left)): Patch[] => [
  { x: LEFT_X, y: EYE_Y, rows: left },
  { x: RIGHT_X, y: EYE_Y, rows: right },
]

// глаз 10×6: ресницы сверху, блик слева вверху (свет один — оба глаза одинаковые), зрачок, светлый низ радужки
const OPEN = [
  'SEEEEEEEES',
  'EEEEEEEEEE',
  'EeWWEEeeeE',
  'EeWeEEeeeE',
  'SeeiiiieeS',
  'SSeiiiieSS',
]
const CLOSED = [
  '          ',
  '          ',
  'SSSSSSSSSS',
  'EESSSSSSEE',
  'SEEEEEEEES',
  'SSSSSSSSSS',
]
const SMILE = [
  '          ',
  'SSSSSSSSSS',
  'SSEEEEEESS',
  'EEEEEEEEEE',
  'EESSSSSSEE',
  'SSSSSSSSSS',
]
const SLEEPY = [
  '          ',
  '          ',
  'SSSSSSSSSS',
  'SSSSSSSSSS',
  'EEEEEEEEEE',
  'SEESEESEES',
]
// удивление: глаз круглее, радужка видна целиком, зрачок меньше
const WIDE = [
  'EEEEEEEEEE',
  'EEeeeeeeEE',
  'EeWWeeeeeE',
  'EeWeeEEeeE',
  'EEeiiiieEE',
  'SEeiiiieES',
]
// задумалась: смотрит вбок
const SIDE = [
  'SEEEEEEEES',
  'EEEEEEEEEE',
  'EeeeeWWEEE',
  'EeeeeWeEEE',
  'SeiiiieeeS',
  'SSiiiieeSS',
]

const brows = (left: readonly string[], right: readonly string[]): Patch[] => [
  { x: LEFT_X, y: 8, rows: left },
  { x: RIGHT_X, y: 8, rows: right },
]
const BLUSH: Patch[] = [
  { x: 12, y: 18, rows: ['SBBBBBBS', 'SSBBBBSS'] },
  { x: 36, y: 18, rows: ['SBBBBBBS', 'SSBBBBSS'] },
]
const mouth = (rows: readonly string[]): Patch => ({ x: 28 - rows[0].length / 2, y: 20, rows })
const NO = '          '

const FACES: Record<Mood, { eyes: Patch[]; extra: Patch[]; mouth: Patch; talk: Patch }> = {
  neutral: { eyes: eyes(OPEN, OPEN), extra: BLUSH, mouth: mouth(['MSSM', 'SMMS']), talk: mouth(['MMMM', 'SMMS']) },
  happy: { eyes: eyes(SMILE), extra: BLUSH, mouth: mouth(['MMMMMMMM', 'SSMMMMSS']), talk: mouth(['MMMMMMMM', 'SMMMMMMS']) },
  thinking: {
    eyes: eyes(SIDE, SIDE),
    extra: [...brows([NO, NO, 'DDDDDDDDSS', 'SSSSSSSSSS'], ['SSSSDDDDDD', 'DDDDSSSSSS', NO, NO]), ...BLUSH],
    mouth: mouth(['SSMMMM', 'SSSSSS']),
    talk: mouth(['SSMMMM', 'SSMMMM']),
  },
  worried: {
    eyes: eyes(OPEN, OPEN),
    extra: brows([NO, 'SSSSSSSDDD', 'SSSDDDDSSS', 'DDDSSSSSSS'], [NO, 'DDDSSSSSSS', 'SSSDDDDSSS', 'SSSSSSSDDD']),
    mouth: mouth(['SSMMSS', 'MMSSMM']),
    talk: mouth(['SMMMMS', 'MMSSMM']),
  },
  sleepy: { eyes: eyes(SLEEPY), extra: BLUSH, mouth: mouth(['SSMMSS', 'SSSSSS']), talk: mouth(['SSMMSS', 'SSMMSS']) },
  surprised: {
    eyes: eyes(WIDE, WIDE),
    extra: brows(['SSDDDDDDSS', 'DDSSSSSSDD', NO, NO], ['SSDDDDDDSS', 'DDSSSSSSDD', NO, NO]),
    mouth: mouth(['SMMS', 'MMMM']),
    talk: mouth(['MMMM', 'MMMM']),
  },
}

// карта символов палитры LARGE_HEIGHT × LARGE_WIDTH
export function composeLarge(pose: Pose): string[] {
  const face = FACES[pose.mood]
  const grid = LARGE_BASE.map(row => [...row])
  // наклейка не лезет на волосы: кожа наклейки ложится только на кожу, а линии — и на тень от чёлки
  const paste = (p: Patch) =>
    p.rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
      const under = grid[p.y + dy]?.[p.x + dx]
      if (ch === ' ' || under === undefined) return
      if (under !== 'S' && under !== 's') return
      grid[p.y + dy][p.x + dx] = ch
    }))
  const closed = pose.blink && pose.mood !== 'happy' && pose.mood !== 'sleepy'
  ;(closed ? eyes(CLOSED) : face.eyes).forEach(paste)
  face.extra.forEach(paste)
  paste(pose.talk ? face.talk : face.mouth)
  return grid.map(row => row.join(''))
}

// отрезки для терминала; rows < LARGE_ROWS обрезает портрет снизу (плечи), лицо остаётся целым
export const largePortrait = (pose: Pose, rows = LARGE_ROWS): Run[][] =>
  toQuadRuns(composeLarge(pose).slice(0, Math.max(LARGE_MIN_ROWS, Math.min(LARGE_ROWS, rows)) * 2))
