// Делёж полосы над строкой ввода между модами. Запуск: node --test "tests/**/*.spec.ts"
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { bandRoom, companionRoom, gameRoom, heightOf } from '../hooks/band.ts'

const text = (s: string) => ({ type: 'Text', children: [s] })
const column = (...children: unknown[]) => ({ type: 'Box', props: { flexDirection: 'column' }, children })

describe('полоса', () => {
  test('высота дерева соседей: пустое — 0, текст — строка, колонка — сумма, ряд — максимум, Client — заявленная', () => {
    assert.equal(heightOf(null), 0)
    assert.equal(heightOf(text('')), 0)
    assert.equal(heightOf(column(text(''), null, false)), 0)
    assert.equal(heightOf(text('привет')), 1)
    assert.equal(heightOf(column(text('а'), text('б'), [text('в')])), 3)
    assert.equal(heightOf({ type: 'Box', props: { flexDirection: 'row' }, children: [column(text('а'), text('б')), text('в')] }), 2)
    assert.equal(heightOf({ type: 'Box', props: { flexDirection: 'column', borderStyle: 'round', height: 7 }, children: [text('а')] }), 7)
    assert.equal(heightOf({ type: 'Box', props: { flexDirection: 'column', borderStyle: 'round' }, children: [text('а')] }), 3)
    assert.equal(heightOf(column({ type: 'Client', props: { height: 19 } }, text(''))), 19)
    assert.equal(heightOf({ type: 'Input', props: {} }), 1)
  })

  test('место: в полноэкранном режиме — сколько дал движок, на обычном экране — половина окна', () => {
    assert.equal(bandRoom(19, { isFullscreen: true }), 19)
    assert.equal(bandRoom(50, { isFullscreen: false }), 25)
    assert.equal(bandRoom(50, undefined), 25)
  })

  test('игра делится, пока хватает минимума, иначе занимает полосу одна; компаньон уступает до нуля', () => {
    const chan = column({ type: 'Box', props: { height: 16 }, children: [] }, { type: 'Input', props: {} }, text('подсказка'))
    assert.equal(heightOf(chan), 18)
    assert.deepEqual(gameRoom(19, chan, 8), { room: 19, beneath: null })
    const line = text('Claude-чан (•‿•)')
    assert.deepEqual(gameRoom(19, line, 8), { room: 18, beneath: line })
    // пустое «под нами» (так рисует сам движок) остаётся как есть
    assert.deepEqual(gameRoom(19, null, 8), { room: 19, beneath: null })
    assert.equal(companionRoom(19, column({ type: 'Client', props: { height: 19 } })), 0)
    assert.equal(companionRoom(19, column({ type: 'Client', props: { height: 8 } })), 11)
    assert.equal(companionRoom(19, null), 19)
  })
})
