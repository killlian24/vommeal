/**
 * Pure planning for moving planned evenings around (no DB access).
 * Used by lib/db.ts inside a transaction and by the week page for previews.
 * Unit-tested in tests/planMoves.test.ts.
 *
 * Dates are `YYYY-MM-DD` calendar days; one dinner per date is the rule.
 */

export type PlanSlot = { id: string; date: string }
export type PlanMove = { id: string; from: string; to: string }
export type PlanResult = { ok: true; moves: PlanMove[] } | { ok: false; error: string }

/** Calendar arithmetic on `YYYY-MM-DD` strings (UTC, so no DST surprises). */
export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function byDate(slots: PlanSlot[]): Map<string, PlanSlot[]> {
  const map = new Map<string, PlanSlot[]>()
  for (const s of slots) {
    const list = map.get(s.date)
    if (list) list.push(s)
    else map.set(s.date, [s])
  }
  return map
}

/**
 * The planned evening on `from` and every directly following planned
 * evening, up to (not including) the first free one.
 */
export function consecutiveChain(slots: PlanSlot[], from: string): string[] {
  const dates = byDate(slots)
  const chain: string[] = []
  let d = from
  // Bounded so malformed data can never loop forever.
  while (dates.has(d) && chain.length < 3660) {
    chain.push(d)
    d = addDaysIso(d, 1)
  }
  return chain
}

/**
 * Shift the evening on `from` and the consecutive evenings after it by one day.
 * - days = 1: everything slides one day later; the first free evening after
 *   the chain absorbs the shift.
 * - days = -1: the chain slides one day earlier into the free evening before
 *   `from`; fails when that evening is taken.
 */
export function planShift(slots: PlanSlot[], from: string, days: 1 | -1): PlanResult {
  const dates = byDate(slots)
  if (!dates.has(from)) return { ok: false, error: 'An diesem Tag ist nichts geplant' }
  if (days === -1 && dates.has(addDaysIso(from, -1))) {
    return { ok: false, error: 'Der Tag davor ist schon belegt' }
  }
  const moves: PlanMove[] = []
  for (const date of consecutiveChain(slots, from)) {
    for (const s of dates.get(date)!) moves.push({ id: s.id, from: date, to: addDaysIso(date, days) })
  }
  return { ok: true, moves }
}

/** Move one entry to `to`; an entry already on `to` swaps places with it. */
export function planMove(slots: PlanSlot[], id: string, to: string): PlanResult {
  const entry = slots.find(s => s.id === id)
  if (!entry) return { ok: false, error: 'Eintrag nicht gefunden' }
  if (entry.date === to) return { ok: true, moves: [] }
  const moves: PlanMove[] = [{ id, from: entry.date, to }]
  for (const other of slots) {
    if (other.date === to && other.id !== id) moves.push({ id: other.id, from: to, to: entry.date })
  }
  return { ok: true, moves }
}

/**
 * Check a set of target dates (e.g. an undo). `slots` must contain every
 * entry currently on a target date and every entry that is moved.
 * Fails for unknown ids, repeated ids or two entries ending up on one date.
 */
export function planReorder(slots: PlanSlot[], targets: { id: string; date: string }[]): PlanResult {
  const current = new Map(slots.map(s => [s.id, s.date]))
  const seen = new Set<string>()
  const moves: PlanMove[] = []
  for (const t of targets) {
    if (seen.has(t.id)) return { ok: false, error: 'Ein Eintrag kommt mehrfach vor' }
    seen.add(t.id)
    const from = current.get(t.id)
    if (from === undefined) return { ok: false, error: 'Eintrag nicht gefunden' }
    if (from !== t.date) moves.push({ id: t.id, from, to: t.date })
  }
  const final = applyMoves(slots, moves)
  const targetDates = new Set(targets.map(t => t.date))
  const count = new Map<string, number>()
  for (const s of final) {
    if (!targetDates.has(s.date)) continue
    const n = (count.get(s.date) ?? 0) + 1
    if (n > 1) return { ok: false, error: 'Zwei Gerichte am selben Abend' }
    count.set(s.date, n)
  }
  return { ok: true, moves }
}

/** Slots after applying `moves` (ids keep their identity). */
export function applyMoves<T extends PlanSlot>(slots: T[], moves: PlanMove[]): T[] {
  const to = new Map(moves.map(m => [m.id, m.to]))
  return slots.map(s => (to.has(s.id) ? { ...s, date: to.get(s.id)! } : s))
}
