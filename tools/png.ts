// Мини-кодировщик PNG (RGB, без зависимостей): нужен, чтобы смотреть на кадры рендера глазами —
// снимок терминала через tmux цвет не передаёт.
import { deflateSync } from 'node:zlib'

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff
  for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set([...type].map(ch => ch.charCodeAt(0)), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

// pixels — 0xRRGGBB построчно; scale — во сколько раз увеличить (целое)
export function encodePng(pixels: Uint32Array, w: number, h: number, scale = 1): Uint8Array {
  const W = w * scale
  const H = h * scale
  const raw = new Uint8Array(H * (1 + W * 3))
  for (let y = 0; y < H; y++) {
    const row = y * (1 + W * 3)
    for (let x = 0; x < W; x++) {
      const p = pixels[Math.floor(y / scale) * w + Math.floor(x / scale)]
      raw[row + 1 + x * 3] = (p >> 16) & 255
      raw[row + 2 + x * 3] = (p >> 8) & 255
      raw[row + 3 + x * 3] = p & 255
    }
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, W)
  view.setUint32(4, H)
  header.set([8, 2, 0, 0, 0], 8)
  const parts = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}
