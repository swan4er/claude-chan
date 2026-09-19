// Снимок терминала (tmux capture-pane -e -p) → PNG: как Claude-чан выглядит на самом деле.
// Понимает цвета текста и фона (24-битные и палитру на 256), символы ▀ ▄ █; остальное — фон.
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
const scale = Number(scaleArg) || 10
const BG = 0x1e1e2e
const rows: [number, number][][] = []
for (const line of readFileSync(input, 'utf8').split('\n')) {
  if (!/[▀▄█]/.test(line)) continue
  const cells: [number, number][] = []
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
    } else if (cells.length < cols) cells.push(m[2] === '▀' ? [fg, bg] : m[2] === '▄' ? [bg, fg] : m[2] === '█' ? [fg, fg] : [bg, bg])
  }
  while (cells.length < cols) cells.push([BG, BG])
  rows.push(cells)
}
const buf = new Uint32Array(cols * rows.length * 2)
rows.forEach((cells, y) => cells.forEach(([top, bottom], x) => { buf[y * 2 * cols + x] = top; buf[(y * 2 + 1) * cols + x] = bottom }))
writeFileSync(output, encodePng(buf, cols, rows.length * 2, scale))
console.log(`${rows.length} строк × ${cols} колонок → ${output}`)
