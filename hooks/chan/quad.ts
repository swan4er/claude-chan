// Карта пикселей → клетки терминала из четвертинок (▘▝▖▗▀▄▌▐▚▞▙▛▜▟█): 2×2 пикселя на клетку, то есть
// вдвое больше точек по горизонтали, чем дают полублоки. Цена — в клетке только два цвета: цвет
// символа и цвет фона. Где в четырёх пикселях клетки цветов больше, остаются два самых частых, а
// остальные пиксели получают ближайший из них.
//
// Пиксель такой клетки вытянут: он вдвое выше своей ширины. Поэтому карта крупного портрета
// рисуется с двойным разрешением по горизонтали (56×32 точки — это почти квадрат на экране).
import { PALETTE, type Rgb, type Run } from './portrait.ts'

// биты: 1 — левый верхний, 2 — правый верхний, 4 — левый нижний, 8 — правый нижний
const GLYPHS = [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█']

export type Cell = { glyph: string; fg?: string; bg?: string }

const distance = (a: Rgb, b: Rgb) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

// '.' — прозрачный пиксель: на его месте остаётся фон терминала
function reduce(pixels: string[]): string[] {
  const count = new Map<string, number>()
  for (const p of pixels) count.set(p, (count.get(p) ?? 0) + 1)
  if (count.size <= 2) return pixels
  // два самых частых; при равенстве — в порядке появления, чтобы результат не зависел от случая
  const keep = [...count].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([p]) => p)
  return pixels.map(p => {
    if (keep.includes(p)) return p
    const solid = keep.filter(k => k !== '.')
    // прозрачного «ближайшего» не бывает: лишний цвет уходит в ближайший непрозрачный
    if (p === '.' || solid.length === 0) return keep[0]
    return solid.reduce((best, k) => (distance(PALETTE[p], PALETTE[k]) < distance(PALETTE[p], PALETTE[best]) ? k : best))
  })
}

const hex = ([r, g, b]: Rgb) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')

// сколько клеток пришлось упростить — для теста и предпросмотра: рисунок должен почти не терять
export function overloadedCells(map: readonly string[]): number {
  let n = 0
  for (let y = 0; y < map.length; y += 2) for (let x = 0; x < map[y].length; x += 2) {
    if (new Set([map[y][x], map[y][x + 1], map[y + 1][x], map[y + 1][x + 1]]).size > 2) n++
  }
  return n
}

export function toCells(map: readonly string[]): Cell[][] {
  const out: Cell[][] = []
  for (let y = 0; y < map.length; y += 2) {
    const line: Cell[] = []
    for (let x = 0; x < map[y].length; x += 2) {
      const px = reduce([map[y][x], map[y][x + 1] ?? '.', map[y + 1]?.[x] ?? '.', map[y + 1]?.[x + 1] ?? '.'])
      const kinds = [...new Set(px)]
      const solid = kinds.filter(k => k !== '.')
      if (solid.length === 0) {
        line.push({ glyph: ' ' })
        continue
      }
      // цвет символа — тот же, что у соседа слева, если он здесь есть: так соседние клетки сливаются в один отрезок
      const left = line[line.length - 1]
      const fgKind = solid.find(k => hex(PALETTE[k]) === left?.fg) ?? solid[0]
      const bgKind = kinds.find(k => k !== fgKind)
      const bits = px.reduce((mask, p, i) => mask | (p === fgKind ? 1 << i : 0), 0)
      line.push({ glyph: GLYPHS[bits], fg: hex(PALETTE[fgKind]), bg: bgKind && bgKind !== '.' ? hex(PALETTE[bgKind]) : undefined })
    }
    out.push(line)
  }
  return out
}

// клетки → отрезки с одинаковой парой цветов (символы внутри отрезка разные)
export function toQuadRuns(map: readonly string[]): Run[][] {
  return toCells(map).map(line => {
    const runs: Run[] = []
    for (const cell of line) {
      const last = runs[runs.length - 1]
      // пробел и полный блок не зависят от второго цвета: их можно приклеить к любому подходящему отрезку
      const same = last && last.fg === cell.fg && last.bg === cell.bg
      if (same) last.text += cell.glyph
      else runs.push({ text: cell.glyph, fg: cell.fg, bg: cell.bg })
    }
    return runs
  })
}

// цвета пикселей после упрощения клеток — ровно то, что покажет терминал; для предпросмотра
export function shownPixels(map: readonly string[]): (Rgb | undefined)[][] {
  const out: (Rgb | undefined)[][] = map.map(row => Array<Rgb | undefined>(row.length).fill(undefined))
  for (let y = 0; y < map.length; y += 2) for (let x = 0; x < map[y].length; x += 2) {
    const px = reduce([map[y][x], map[y][x + 1] ?? '.', map[y + 1]?.[x] ?? '.', map[y + 1]?.[x + 1] ?? '.'])
    px.forEach((p, i) => {
      const yy = y + (i >> 1)
      const xx = x + (i & 1)
      if (out[yy] && xx < out[yy].length) out[yy][xx] = p === '.' ? undefined : PALETTE[p]
    })
  }
  return out
}
