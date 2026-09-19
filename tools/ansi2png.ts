// Снимок терминала (tmux capture-pane -e -p) → PNG: как Claude-чан выглядит на самом деле.
// Понимает цвета текста и фона (24-битные и палитру на 256), полублоки и четвертинки клетки; остальное — фон.
// Клетка — 2×2 точки, точка вытянута 1:2, как в терминале.
// node tools/ansi2png.ts <вход.ansi> <выход.png> [колонок] [масштаб]
import { readFileSync, writeFileSync } from 'node:fs'
import { encodePng } from './png.ts'

const BASE16 = [0x000000, 0x800000, 0x008000, 0x808000, 0x000080, 0x800080, 0x008080, 0xc0c0c0, 0x808080, 0xff0000, 0x00ff00, 0xffff00, 0x0000ff, 0xff00ff, 0x00ffff, 0xffffff]
function xterm(n: number): number {
  if (n < 16) return BASE16[n]
  if (n >= 232) { const v = 8 + (n - 232) * 10; return (v << 16) | (v << 8) | v }
  const c = n - 16
  const level = (i: number) => (i === 0 ? 0 : 55 + i * 40)
  return (level(Math.floor(c / 36)) << 16) | (level(Math.floor(c / 6) % 6) << 8) | level(c % 6)
}
const [input, output, colsArg, scaleArg] = process.argv.slice(2)
const cols = Number(colsArg) || 20
const scale = Number(scaleArg) || 5
const BG = 0x1e1e2e
// маска четвертинок: 1 — левый верхний, 2 — правый верхний, 4 — левый нижний, 8 — правый нижний
const QUADS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'
const rows: number[][][] = []
for (const line of readFileSync(input, 'utf8').split('\n')) {
  if (!/[▘▝▀▖▌▞▛▗▚▐▜▄▙▟█]/.test(line)) continue
  const cells: number[][] = []
  let fg = 0xcccccc
  let bg = BG
  for (const m of line.matchAll(/\x1b\[([0-9;]*)m|([^\x1b])/gu)) {
    if (m[1] !== undefined) {
      const p = m[1].split(';').map(Number)
      for (let i = 0; i < p.length; i++) {
        if (p[i] === 38 && p[i + 1] === 2) { fg = (p[i + 2] << 16) | (p[i + 3] << 8) | p[i + 4]; i += 4 }
        else if (p[i] === 48 && p[i + 1] === 2) { bg = (p[i + 2] << 16) | (p[i + 3] << 8) | p[i + 4]; i += 4 }
        else if (p[i] === 38 && p[i + 1] === 5) { fg = xterm(p[i + 2]); i += 2 }
        else if (p[i] === 48 && p[i + 1] === 5) { bg = xterm(p[i + 2]); i += 2 }
        else if (p[i] === 0 || Number.isNaN(p[i])) { fg = 0xcccccc; bg = BG }
        else if (p[i] === 39) fg = 0xcccccc
        else if (p[i] === 49) bg = BG
      }
    } else if (cells.length < cols) {
      const mask = Math.max(0, QUADS.indexOf(m[2]))
      cells.push([1, 2, 4, 8].map(bit => (mask & bit ? fg : bg)))
    }
  }
  while (cells.length < cols) cells.push([BG, BG, BG, BG])
  rows.push(cells)
}
const w = cols * 2 * scale
const h = rows.length * 4 * scale
const buf = new Uint32Array(w * h)
rows.forEach((cells, cy) => cells.forEach((quad, cx) => quad.forEach((color, i) => {
  const x0 = (cx * 2 + (i & 1)) * scale
  const y0 = (cy * 2 + (i >> 1)) * 2 * scale
  for (let dy = 0; dy < 2 * scale; dy++) buf.fill(color, (y0 + dy) * w + x0, (y0 + dy) * w + x0 + scale)
})))
writeFileSync(output, encodePng(buf, w, h, 1))
console.log(`${rows.length} строк × ${cols} колонок → ${output}`)
