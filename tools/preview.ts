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
