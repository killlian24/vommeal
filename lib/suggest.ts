import { isWeeknight } from './autofillPlan'

/**
 * "Was kochen wir heute?" suggestions. Pure and client-safe: used by the
 * /tonight page and by the daily notification (lib/scheduler.ts), so both
 * follow the same rules. Unit-tested in tests/suggest.test.ts.
 */

export type SuggestRecipe = {
  id: string
  rating: number | null
  effort?: 'quick' | 'involved' | null
}

export type SuggestEntry = { date: string; recipe_id: string | null }

/** Days before today that count as "recently cooked". */
export const RECENT_DAYS = 21
/** Days from today on whose planned recipes are not suggested again. */
export const PLANNED_AHEAD_DAYS = 3

export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Recipes tagged with the dinner category (all recipes when no category is set). */
export function inDinnerCategory<T extends { tags?: string[] }>(recipes: T[], category: string): T[] {
  const c = category.trim().toLowerCase()
  if (!c) return recipes
  return recipes.filter(r => (r.tags ?? []).some(t => t.toLowerCase() === c))
}

// Rating ≥ 4 first, then unrated, then the middling ones. Rating 1 never gets here.
function ratingScore(rating: number | null): number {
  if (rating == null) return 2
  if (rating >= 4) return 3
  return 1
}

/**
 * Picks `count` recipes to cook on `today` (YYYY-MM-DD):
 * - never rating 1 ("nicht nochmal")
 * - nothing cooked in the last 21 days or already planned for today and the next 3 days
 * - prefers rating ≥ 4, then unrated; Mon–Thu prefers quick recipes
 * - slight randomness (injectable `random` for tests); `exclude` skips what
 *   was just shown ("Andere Vorschläge")
 * - small collections are topped up with the recipes cooked longest ago
 */
export function pickSuggestions<T extends SuggestRecipe>(
  recipes: T[],
  entries: SuggestEntry[],
  opts: { today: string; exclude?: Set<string>; count?: number; random?: () => number },
): T[] {
  const { today, exclude = new Set<string>(), count = 3, random = Math.random } = opts
  const recentStart = addDaysIso(today, -RECENT_DAYS)
  const plannedEnd = addDaysIso(today, PLANNED_AHEAD_DAYS)
  const preferQuick = isWeeknight(today)

  const lastCooked = new Map<string, string>()
  const planned = new Set<string>()
  for (const e of entries) {
    if (!e.recipe_id) continue
    if (e.date >= today) {
      if (e.date <= plannedEnd) planned.add(e.recipe_id)
      continue
    }
    const prev = lastCooked.get(e.recipe_id)
    if (!prev || e.date > prev) lastCooked.set(e.recipe_id, e.date)
  }

  const allowed = recipes.filter(r => r.rating !== 1 && !planned.has(r.id))
  const fresh = allowed.filter(r => (lastCooked.get(r.id) ?? '') < recentStart)

  const score = (r: T) => {
    let s = ratingScore(r.rating) + random() * 1.2
    if (preferQuick) {
      if (r.effort === 'quick') s += 1.5
      else if (r.effort === 'involved') s -= 1
    }
    return s
  }

  let pool = fresh.filter(r => !exclude.has(r.id))
  if (pool.length < count) pool = fresh // shuffled through everything: start over
  const picked = pool
    .map(r => ({ r, s: score(r) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, count)
    .map(x => x.r)

  // Small collection: top up with the recipes cooked longest ago.
  if (picked.length < count) {
    const ids = new Set(picked.map(r => r.id))
    const rest = allowed
      .filter(r => !ids.has(r.id))
      .sort((a, b) => (lastCooked.get(a.id) ?? '').localeCompare(lastCooked.get(b.id) ?? ''))
    picked.push(...rest.slice(0, count - picked.length))
  }
  return picked
}
