/**
 * Pure autofill planning (no DB access), unit-tested in tests/autofill.test.ts.
 */

export type AutofillRecipe = {
  id: string
  rating: number | null
  effort: 'quick' | 'involved' | null
}

/** 0 = Sunday … 6 = Saturday for a `YYYY-MM-DD` string (calendar day, no timezone shift). */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Monday to Thursday: weeknights where quick recipes are preferred. */
export function isWeeknight(date: string): boolean {
  const dow = dayOfWeek(date)
  return dow >= 1 && dow <= 4
}

/**
 * Candidate recipes for autofill:
 * - rating 1 ("nicht nochmal") is always excluded,
 * - rating 2 is excluded as long as enough other recipes remain.
 */
export function autofillCandidates<T extends AutofillRecipe>(recipes: T[], slotsNeeded: number): T[] {
  const allowed = recipes.filter(r => r.rating !== 1)
  const good = allowed.filter(r => r.rating === null || r.rating > 2)
  return good.length < allowed.length && good.length >= slotsNeeded ? good : allowed
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Shuffled, with recipes not used recently first. */
function ordered<T extends AutofillRecipe>(recipes: T[], recentlyUsed: Set<string>, random: () => number): T[] {
  return [
    ...shuffle(recipes.filter(r => !recentlyUsed.has(r.id)), random),
    ...shuffle(recipes.filter(r => recentlyUsed.has(r.id)), random),
  ]
}

/**
 * Assign a recipe to every empty date.
 * Mon–Thu get quick recipes when there are at least as many quick candidates
 * as empty weeknights; otherwise all days draw from the same pool. Recipes
 * are not repeated within one fill unless the pool is too small.
 */
export function planAutofill<T extends AutofillRecipe>(
  emptyDates: string[],
  candidates: T[],
  recentlyUsed: Set<string>,
  random: () => number = Math.random,
): { date: string; recipe: T }[] {
  if (emptyDates.length === 0 || candidates.length === 0) return []

  const weeknights = emptyDates.filter(isWeeknight)
  const quick = candidates.filter(r => r.effort === 'quick')
  const preferQuick = weeknights.length > 0 && quick.length >= weeknights.length

  const taken = new Set<string>()
  const result = new Map<string, T>()

  if (preferQuick) {
    const quickOrder = ordered(quick, recentlyUsed, random)
    weeknights.forEach((date, i) => {
      result.set(date, quickOrder[i])
      taken.add(quickOrder[i].id)
    })
  }

  const rest = emptyDates.filter(d => !result.has(d))
  const general = ordered(candidates, recentlyUsed, random)
  // Do not repeat the recipes just placed on weeknights (unless nothing else is left).
  const fresh = general.filter(r => !taken.has(r.id))
  const pool = fresh.length > 0 ? fresh : general
  rest.forEach((date, i) => result.set(date, pool[i % pool.length]))

  return emptyDates.map(date => ({ date, recipe: result.get(date)! }))
}
