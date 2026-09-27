import { addDaysIso, RECENT_DAYS } from './suggest'

/**
 * Cards for "Abstimmen": the same rules as the suggestions (lib/suggest.ts),
 * but no randomness, so both phones show the same cards for a day:
 * - never recipes marked "nicht nochmal"
 * - nothing already planned in the range being voted on
 * - nothing cooked in the last 21 days, while enough others are left;
 *   small collections are topped up with what was cooked longest ago
 * The order is a shuffle seeded by the date. Unit-tested in tests/votePool.test.ts.
 */

export type VoteRecipe = { id: string; never_again?: boolean }
export type VoteEntry = { date: string; recipe_id: string | null }

/** Deterministic shuffle seeded by a string. */
export function seededShuffle<T>(arr: T[], seed: string): T[] {
  const copy = [...arr]
  let h = 0
  for (let i = 0; i < seed.length; i++) { h = Math.imul(31, h) + seed.charCodeAt(i) | 0 }
  for (let i = copy.length - 1; i > 0; i--) {
    h = Math.imul(1664525, h) + 1013904223 | 0
    const j = Math.abs(h) % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function votePool<T extends VoteRecipe>(
  recipes: T[],
  entries: VoteEntry[],
  opts: { date: string; today: string; rangeStart: string; rangeEnd: string; count: number },
): T[] {
  const { date, today, rangeStart, rangeEnd, count } = opts
  const recentStart = addDaysIso(today, -RECENT_DAYS)
  const planned = new Set<string>()
  const lastCooked = new Map<string, string>()
  for (const e of entries) {
    if (!e.recipe_id) continue
    if (e.date >= rangeStart && e.date <= rangeEnd) planned.add(e.recipe_id)
    if (e.date < today) {
      const prev = lastCooked.get(e.recipe_id)
      if (!prev || e.date > prev) lastCooked.set(e.recipe_id, e.date)
    }
  }
  // Stable input order (by id), so the shuffle does not depend on how the list came in
  const allowed = recipes
    .filter(r => !r.never_again && !planned.has(r.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const fresh = allowed.filter(r => (lastCooked.get(r.id) ?? '') < recentStart)
  const picked = seededShuffle(fresh, date).slice(0, count)
  if (picked.length < count) {
    const ids = new Set(picked.map(r => r.id))
    const rest = allowed
      .filter(r => !ids.has(r.id))
      .sort((a, b) => (lastCooked.get(a.id) ?? '').localeCompare(lastCooked.get(b.id) ?? '') || (a.id < b.id ? -1 : 1))
    picked.push(...rest.slice(0, count - picked.length))
  }
  return picked
}
