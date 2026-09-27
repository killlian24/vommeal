// "Neu" markers and hints for evenings the partner planned or changed since
// this phone last looked. Everything is per phone (localStorage), times come
// from the server so a wrong phone clock does not matter.

export type ChangedEntry = {
  id: string
  date: string
  suggested_by: string
  created_at?: string
  updated_at?: string
  updated_by?: string
}

/** A marker stays for this long unless the evening was seen before. */
export const MARK_TTL_MS = 24 * 60 * 60 * 1000

/** id → when the marker was set (ms) */
export type Marks = Record<string, number>

/**
 * Timestamp of a SQLite "YYYY-MM-DD HH:MM:SS[.SSS]" value (UTC) or an ISO
 * string; 0 when missing or unreadable.
 */
export function parseDbTime(value: string | null | undefined): number {
  if (!value) return 0
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value) ? value.replace(' ', 'T') + 'Z' : value
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

/** Who changed the evening last: updated_by, or whoever planned it when unknown. */
export function changedBy(e: ChangedEntry): string {
  return e.updated_by || e.suggested_by || ''
}

/**
 * Evenings someone other than `me` planned (new since `since`) or changed
 * (replaced, moved) since `since`. Nothing on the first visit (since = 0).
 */
export function partnerChanges<T extends ChangedEntry>(entries: T[], me: string, since: number): { planned: T[]; changed: T[] } {
  const planned: T[] = []
  const changed: T[] = []
  if (!me || since <= 0) return { planned, changed }
  for (const e of entries) {
    const by = changedBy(e)
    // "Kilian & Susi": a Swipen match both agreed on
    if (!by || by === me || by.split(' & ').includes(me)) continue
    if (parseDbTime(e.updated_at || e.created_at) <= since) continue
    if (parseDbTime(e.created_at) > since) planned.push(e)
    else changed.push(e)
  }
  return { planned, changed }
}

const abende = (n: number) => `${n} ${n === 1 ? 'Abend' : 'Abende'}`

/** "Susi hat 2 Abende geplant", "Susi hat 1 Abend geändert", or both. */
export function partnerHint(planned: ChangedEntry[], changed: ChangedEntry[]): string | null {
  const first = planned[0] ?? changed[0]
  if (!first) return null
  const who = changedBy(first)
  if (planned.length && changed.length) return `${who} hat ${abende(planned.length)} geplant und ${changed.length} geändert`
  if (planned.length) return `${who} hat ${abende(planned.length)} geplant`
  return `${who} hat ${abende(changed.length)} geändert`
}

export function addMarks(marks: Marks, ids: string[], now: number): Marks {
  if (ids.length === 0) return marks
  const next = { ...marks }
  for (const id of ids) next[id] = now
  return next
}

export function pruneMarks(marks: Marks, now: number): Marks {
  const next: Marks = {}
  for (const [id, at] of Object.entries(marks)) if (now - at < MARK_TTL_MS) next[id] = at
  return next
}

export function dropMarks(marks: Marks, ids: string[]): Marks {
  if (!ids.some(id => id in marks)) return marks
  const next = { ...marks }
  for (const id of ids) delete next[id]
  return next
}

/** Server time of a meal-plan response (X-Server-Time, else Date), else the phone clock. */
export function responseTime(res: Response): number {
  return parseDbTime(res.headers.get('x-server-time')) || parseDbTime(res.headers.get('date')) || Date.now()
}

// ---- Per-phone storage ------------------------------------------------------

const marksKey = (user: string) => `vommeal_new_${user}`

export function loadMarks(user: string): Marks {
  try {
    const raw = JSON.parse(localStorage.getItem(marksKey(user)) || '{}')
    return raw && typeof raw === 'object' ? pruneMarks(raw as Marks, Date.now()) : {}
  } catch { return {} }
}

export function saveMarks(user: string, marks: Marks) {
  try { localStorage.setItem(marksKey(user), JSON.stringify(marks)) } catch { /* storage unavailable */ }
}

export function loadLastSeen(key: string): number {
  try { return parseDbTime(localStorage.getItem(key)) } catch { return 0 }
}

export function saveLastSeen(key: string, time: number) {
  try { localStorage.setItem(key, new Date(time).toISOString()) } catch { /* storage unavailable */ }
}
