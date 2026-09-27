// Shopping list without a connection (supermarket basement): the last list
// stays on the phone, check-offs and new items wait in a queue and are sent
// once the connection is back. Every queued request is safe to send twice:
// checks send the target state, adds carry their id (409 = already there),
// deletes of a missing item are a no-op on the server.

export type QueuedOp =
  | { kind: 'check'; id: string; checked: boolean }
  | { kind: 'add'; id: string; name: string; checked: boolean }
  | { kind: 'delete'; id: string }

type ListItem = { id: string; checked: boolean }

/**
 * Add an operation, merged with what is already waiting for that item:
 * only the last check state counts, an item added offline is changed in
 * place, and deleting it again removes it from the queue altogether (the
 * server never knew it, so nothing is sent).
 */
export function enqueue(queue: QueuedOp[], op: QueuedOp): QueuedOp[] {
  const added = queue.find(q => q.kind === 'add' && q.id === op.id)
  if (op.kind === 'check') {
    if (added) return queue.map(q => (q === added ? { ...q, checked: op.checked } : q))
    return [...queue.filter(q => !(q.kind === 'check' && q.id === op.id)), op]
  }
  if (op.kind === 'delete') {
    const rest = queue.filter(q => q.id !== op.id)
    return added ? rest : [...rest, op]
  }
  return queue.some(q => q.kind === 'add' && q.id === op.id) ? queue : [...queue, op]
}

/**
 * The list as it looks with the waiting changes applied. Safe to apply
 * again to a list that already contains them.
 */
export function applyQueue<T extends ListItem>(items: T[], queue: QueuedOp[], makeItem: (op: Extract<QueuedOp, { kind: 'add' }>) => T): T[] {
  let out = items
  for (const op of queue) {
    if (op.kind === 'check') {
      out = out.map(i => (i.id === op.id ? { ...i, checked: op.checked } : i))
    } else if (op.kind === 'delete') {
      out = out.filter(i => i.id !== op.id)
    } else if (!out.some(i => i.id === op.id)) {
      out = [...out, makeItem(op)]
    } else {
      out = out.map(i => (i.id === op.id ? { ...i, checked: op.checked } : i))
    }
  }
  return out
}

/** status 0 = no connection */
export type SendResult = { ok: boolean; status: number }

/**
 * Send waiting operations in order. Without a connection it stops and keeps
 * the rest. A server error (5xx, e.g. Home Assistant unreachable) keeps
 * that operation for the next try but goes on with the others. A rejected
 * one (4xx, e.g. the item was deleted meanwhile) is dropped.
 */
export async function flushQueue(queue: QueuedOp[], send: (op: QueuedOp) => Promise<SendResult>): Promise<{ remaining: QueuedOp[]; sent: number }> {
  const remaining: QueuedOp[] = []
  let sent = 0
  for (let i = 0; i < queue.length; i++) {
    const op = queue[i]
    const res = await send(op)
    if (res.ok) { sent++; continue }
    if (res.status === 0) { remaining.push(...queue.slice(i)); break }
    if (res.status >= 500) remaining.push(op)
  }
  return { remaining, sent }
}

/** Client id for an item added offline (crypto.randomUUID needs https). */
export function newItemId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch { /* insecure context */ }
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`
}

// ---- Per-phone storage ------------------------------------------------------

const CACHE_KEY = 'vommeal_shopping_cache'
const QUEUE_KEY = 'vommeal_shopping_queue'

/** Last list shown and when it last came from the server. */
export type ListCache<T> = { items: T[]; at: number }

export function readCache<T>(): ListCache<T> | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
    return raw && Array.isArray(raw.items) && typeof raw.at === 'number' ? raw : null
  } catch { return null }
}

export function writeCache<T>(cache: ListCache<T>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch { /* storage full or unavailable */ }
}

export function readQueue(): QueuedOp[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter(op => op && typeof op.id === 'string' && ['check', 'add', 'delete'].includes(op.kind)) : []
  } catch { return [] }
}

export function writeQueue(queue: QueuedOp[]) {
  try {
    if (queue.length === 0) localStorage.removeItem(QUEUE_KEY)
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch { /* storage unavailable */ }
}
