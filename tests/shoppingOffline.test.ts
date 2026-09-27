import { describe, it, expect } from 'vitest'
import { enqueue, applyQueue, flushQueue, newItemId, type QueuedOp, type SendResult } from '../lib/shoppingOffline'

type Item = { id: string; name: string; checked: boolean }
const make = (op: { id: string; name: string; checked: boolean }): Item => ({ id: op.id, name: op.name, checked: op.checked })
const list: Item[] = [
  { id: 'a', name: 'Milch', checked: false },
  { id: 'b', name: 'Brot', checked: false },
]

describe('enqueue', () => {
  it('keeps only the last check state per item', () => {
    let q: QueuedOp[] = []
    q = enqueue(q, { kind: 'check', id: 'a', checked: true })
    q = enqueue(q, { kind: 'check', id: 'b', checked: true })
    q = enqueue(q, { kind: 'check', id: 'a', checked: false })
    expect(q).toEqual([
      { kind: 'check', id: 'b', checked: true },
      { kind: 'check', id: 'a', checked: false },
    ])
  })

  it('changes an item added offline in place', () => {
    let q: QueuedOp[] = [{ kind: 'add', id: 'n', name: 'Eier', checked: false }]
    q = enqueue(q, { kind: 'check', id: 'n', checked: true })
    expect(q).toEqual([{ kind: 'add', id: 'n', name: 'Eier', checked: true }])
  })

  it('forgets an item added and deleted offline: nothing reaches the server', () => {
    let q: QueuedOp[] = [{ kind: 'add', id: 'n', name: 'Eier', checked: false }]
    q = enqueue(q, { kind: 'delete', id: 'n' })
    expect(q).toEqual([])
  })

  it('a delete replaces waiting checks of a server item', () => {
    let q: QueuedOp[] = [{ kind: 'check', id: 'a', checked: true }]
    q = enqueue(q, { kind: 'delete', id: 'a' })
    q = enqueue(q, { kind: 'delete', id: 'a' })
    expect(q).toEqual([{ kind: 'delete', id: 'a' }])
  })

  it('never queues the same add twice', () => {
    const add: QueuedOp = { kind: 'add', id: 'n', name: 'Eier', checked: false }
    expect(enqueue(enqueue([], add), add)).toHaveLength(1)
  })
})

describe('applyQueue', () => {
  const q: QueuedOp[] = [
    { kind: 'check', id: 'a', checked: true },
    { kind: 'add', id: 'n', name: 'Eier', checked: false },
    { kind: 'delete', id: 'b' },
  ]

  it('shows the waiting changes on top of the server list', () => {
    expect(applyQueue(list, q, make)).toEqual([
      { id: 'a', name: 'Milch', checked: true },
      { id: 'n', name: 'Eier', checked: false },
    ])
  })

  it('is safe to apply twice (cached list already contains the changes)', () => {
    const once = applyQueue(list, q, make)
    expect(applyQueue(once, q, make)).toEqual(once)
  })

  it('an add the server already has does not appear twice', () => {
    const server = [...list, { id: 'n', name: 'Eier', checked: false }]
    expect(applyQueue(server, [{ kind: 'add', id: 'n', name: 'Eier', checked: true }], make).filter(i => i.id === 'n'))
      .toEqual([{ id: 'n', name: 'Eier', checked: true }])
  })
})

describe('flushQueue', () => {
  const q: QueuedOp[] = [
    { kind: 'check', id: 'a', checked: true },
    { kind: 'add', id: 'n', name: 'Eier', checked: false },
    { kind: 'check', id: 'b', checked: true },
  ]
  const sender = (results: Record<string, SendResult>) => {
    const sent: string[] = []
    const send = async (op: QueuedOp) => { sent.push(op.id); return results[op.id] ?? { ok: true, status: 200 } }
    return { sent, send }
  }

  it('sends everything in order', async () => {
    const { sent, send } = sender({})
    expect(await flushQueue(q, send)).toEqual({ remaining: [], sent: 3 })
    expect(sent).toEqual(['a', 'n', 'b'])
  })

  it('stops without a connection and keeps the rest in order', async () => {
    const { sent, send } = sender({ n: { ok: false, status: 0 } })
    const r = await flushQueue(q, send)
    expect(sent).toEqual(['a', 'n'])
    expect(r).toEqual({ remaining: q.slice(1), sent: 1 })
  })

  it('keeps a server error for later but goes on, drops rejected ones', async () => {
    const { sent, send } = sender({ a: { ok: false, status: 502 }, n: { ok: false, status: 404 } })
    const r = await flushQueue(q, send)
    expect(sent).toEqual(['a', 'n', 'b'])
    expect(r).toEqual({ remaining: [q[0]], sent: 1 })
  })
})

describe('newItemId', () => {
  it('makes distinct uuid-shaped ids', () => {
    const a = newItemId()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newItemId()).not.toBe(a)
  })
})
