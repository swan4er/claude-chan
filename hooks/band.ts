// Полоса над строкой ввода общая: в неё рисуют все моды сразу, каждый оборачивает то, что нарисовали
// хуки под ним (`await next(e)`). Порядок модов задаёт движок, друг о друге они не знают, а `maxRows`
// у всех одинаковый — поэтому два мода легко занимают вдвое больше, чем есть, и движок начинает
// прокручивать полосу («↓ 19 more»), пряча нижние строки. Единственное, что мод видит, — дерево
// соседей под собой. Здесь — оценка его высоты в строках.
//
// Оценка грубая и намеренно занижающая только в одном: перенос длинного текста не учитывается.

type Node = { type?: unknown; props?: Record<string, unknown> | null; children?: unknown } | null | undefined | string | number | boolean

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function heightOf(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((sum: number, child) => sum + heightOf(child), 0)
  if (node === null || node === undefined || typeof node === 'boolean') return 0
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim() === '' ? 0 : 1
  if (typeof node !== 'object') return 0
  const { type, props, children } = node as Exclude<Node, string | number | boolean | null | undefined>
  const p = props ?? {}
  const kids = Array.isArray(children) ? children : children === undefined ? [] : [children]
  if (type === 'Text') return kids.some(k => heightOf(k) > 0) ? 1 : 0
  if (type === 'Box') {
    if (num(p.height) > 0) return num(p.height) + num(p.marginTop) + num(p.marginBottom)
    const inner = p.flexDirection === 'row' || p.flexDirection === 'row-reverse' || p.flexDirection === undefined
      ? Math.max(0, ...kids.map(heightOf))
      : kids.reduce((sum: number, k) => sum + heightOf(k), 0)
    if (inner === 0) return 0
    const frame = (p.borderStyle ? 2 : 0) + 2 * num(p.paddingY) + num(p.paddingTop) + num(p.paddingBottom) + 2 * num(p.padding)
    return inner + frame + num(p.marginTop) + num(p.marginBottom) + 2 * num(p.marginY)
  }
  // Client, Raster, Image — с заявленной высотой; Input, Button и незнакомое — одна строка
  return Math.max(1, num(p.height))
}

// Сколько строк полосы можно занять. В полноэкранном режиме maxRows — уже остаток нижней половины
// окна; на обычном экране это вся высота терминала, и там берём не больше половины.
export const bandRoom = (maxRows: number, viewport: { isFullscreen?: boolean } | undefined): number =>
  viewport?.isFullscreen === true ? maxRows : Math.floor(maxRows / 2)

// Игра, которую человек открыл командой, важнее соседей: если вместе с ними не набирается minRows,
// соседи не рисуются, пока она открыта. under — то, что вернул next(e).
export function gameRoom<T>(room: number, under: T, minRows: number): { room: number; beneath: T | null } {
  const taken = heightOf(under)
  return room - taken >= minRows ? { room: room - taken, beneath: under } : { room, beneath: taken > 0 ? null : under }
}

// Компаньон уступает: ему остаётся то, что не заняли соседи.
export const companionRoom = (room: number, under: unknown): number => Math.max(0, room - heightOf(under))
