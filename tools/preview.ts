// Лист выражений Claude-чан в PNG: node tools/preview.ts
// Верхний ряд — как в терминале с 24-битным цветом, нижний — как покажет терминал на 256 цветов.
import { mkdirSync, writeFileSync } from 'node:fs'
import { HEIGHT, PALETTE, WIDTH, compose, shownIn256, type Pose, type Rgb } from '../hooks/chan/portrait.ts'
import { encodePng } from './png.ts'

const BG: Rgb = [30, 30, 46]
const poses: Pose[] = [
  { mood: 'neutral' }, { mood: 'neutral', blink: true }, { mood: 'neutral', talk: true }, { mood: 'happy' }, { mood: 'happy', talk: true },
  { mood: 'thinking' }, { mood: 'worried' }, { mood: 'sleepy' }, { mood: 'surprised' },
]
const GAP = 3
const W = poses.length * (WIDTH + GAP) + GAP
const H = 2 * (HEIGHT + GAP) + GAP
const buf = new Uint32Array(W * H).fill((BG[0] << 16) | (BG[1] << 8) | BG[2])
poses.forEach((pose, i) => {
  const map = compose(pose)
  for (const [row, tone] of [[0, (c: Rgb) => c], [1, shownIn256]] as const) {
    map.forEach((line, y) => [...line].forEach((ch, x) => {
      const c = PALETTE[ch]
      if (!c) return
      const [r, g, b] = tone(c)
      buf[(GAP + row * (HEIGHT + GAP) + y) * W + GAP + i * (WIDTH + GAP) + x] = (r << 16) | (g << 8) | b
    }))
  }
})
mkdirSync('preview', { recursive: true })
writeFileSync('preview/sheet.png', encodePng(buf, W, H, 8))
console.log(`preview/sheet.png: ${poses.length} поз, ${W}×${H}`)

// Крупный портрет: точки показаны уже после упрощения клеток до двух цветов (quad.ts) и вытянуты 1:2,
// как в терминале. preview/large.png — лист поз, preview/large-one.png — одна поза крупно.
{
  const { LARGE_HEIGHT, LARGE_WIDTH, composeLarge } = await import('../hooks/chan/large.ts')
  const { overloadedCells, shownPixels } = await import('../hooks/chan/quad.ts')
  const sheet = (list: Pose[], sx: number, file: string) => {
    const sy = sx * 2
    const gap = 8
    const w = list.length * (LARGE_WIDTH * sx + gap) + gap
    const h = 2 * (LARGE_HEIGHT * sy + gap) + gap
    const out = new Uint32Array(w * h).fill((BG[0] << 16) | (BG[1] << 8) | BG[2])
    list.forEach((pose, i) => {
      const shown = shownPixels(composeLarge(pose))
      for (const [row, tone] of [[0, (c: Rgb) => c], [1, shownIn256]] as const) {
        shown.forEach((line, y) => line.forEach((c, x) => {
          if (!c) return
          const [r, g, b] = tone(c)
          for (let dy = 0; dy < sy; dy++) for (let dx = 0; dx < sx; dx++) {
            out[(gap + row * (LARGE_HEIGHT * sy + gap) + y * sy + dy) * w + gap + i * (LARGE_WIDTH * sx + gap) + x * sx + dx] = (r << 16) | (g << 8) | b
          }
        }))
      }
    })
    writeFileSync(file, encodePng(out, w, h, 1))
    console.log(`${file}: ${w}×${h}`)
  }
  sheet(poses, 2, 'preview/large.png')
  sheet([{ mood: 'neutral' }, { mood: 'happy', talk: true }], 5, 'preview/large-one.png')
  console.log('упрощённых клеток:', poses.map(p => overloadedCells(composeLarge(p))).join(' '))
}
