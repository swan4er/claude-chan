// Бабл: перенос текста по словам и «печать» по буквам.

// строки не длиннее width; слово длиннее строки режется
export function wrap(text: string, width: number): string[] {
  const w = Math.max(4, Math.floor(width))
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = [...word]
    while (rest.length > w) {
      if (line) { lines.push(line); line = '' }
      lines.push(rest.slice(0, w).join(''))
      rest = rest.slice(w)
    }
    const piece = rest.join('')
    if (!line) line = piece
    else if ([...line].length + 1 + rest.length <= w) line += ' ' + piece
    else { lines.push(line); line = piece }
  }
  if (line) lines.push(line)
  return lines
}

export const CHARS_PER_SECOND = 45

// сколько символов реплики уже «напечатано» через elapsedMs после её начала
export const typedCount = (text: string, elapsedMs: number) =>
  Math.max(0, Math.min([...text].length, Math.floor((elapsedMs / 1000) * CHARS_PER_SECOND)))

export const isTyping = (text: string, elapsedMs: number) => typedCount(text, elapsedMs) < [...text].length

// видимая часть реплики: не больше maxLines последних строк, чтобы длинный ответ прокручивался
export function visibleLines(text: string, elapsedMs: number, width: number, maxLines: number): string[] {
  const shown = [...text].slice(0, typedCount(text, elapsedMs)).join('')
  const lines = wrap(shown, width)
  return lines.slice(-Math.max(1, maxLines))
}

// рот открывается и закрывается, пока идёт печать
export const mouthOpen = (elapsedMs: number) => Math.floor(elapsedMs / 140) % 2 === 0

// моргание: раз в BLINK_EVERY_MS глаза закрыты на BLINK_MS
const BLINK_EVERY_MS = 4200
const BLINK_MS = 180
export const isBlinking = (nowMs: number) => nowMs % BLINK_EVERY_MS < BLINK_MS
