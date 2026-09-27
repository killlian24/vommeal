import { quickMealEmoji } from './quickMeals'

/**
 * Small, pure helpers for showing planned evenings outside the app
 * (Home Assistant sensors in lib/haDashboard.ts, calendar feed in
 * lib/calendarFeed.ts). No DB, no network.
 */

/** What a planned evening needs for display (a subset of MealPlanEntry). */
export type PlanDisplayEntry = {
  id: string
  date: string
  recipe_id: string | null
  custom_meal_name: string | null
  suggested_by: string
  recipe?: { name?: string | null; image_url?: string | null } | null
}

export const WEEKDAYS_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
export const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD date (calendar date, no time zone involved). */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Monday of the week (Mon–Sun) that contains `date`. */
export function mondayOf(date: string): string {
  return addDaysIso(date, -((weekdayOf(date) + 6) % 7))
}

/** "22.9." */
export function shortGermanDate(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${d}.${m}.`
}

/** Recipe name, or the custom meal name (quick meals like "Auswärts essen" included); '' when neither. */
export function dishName(entry: Pick<PlanDisplayEntry, 'custom_meal_name' | 'recipe'> | null | undefined): string {
  return entry?.recipe?.name?.trim() || entry?.custom_meal_name?.trim() || ''
}

/** The emoji of a quick meal (only for entries without a recipe), else null. */
export function entryEmoji(entry: Pick<PlanDisplayEntry, 'recipe_id' | 'custom_meal_name'> | null | undefined): string | null {
  if (!entry || entry.recipe_id) return null
  return quickMealEmoji(entry.custom_meal_name?.trim())
}

/** Dish name with the quick-meal emoji in front ("🍽️ Auswärts essen"). */
export function dishWithEmoji(entry: PlanDisplayEntry | null | undefined): string {
  const name = dishName(entry)
  const emoji = entryEmoji(entry)
  return emoji && name ? `${emoji} ${name}` : name
}

/** `app_public_url` without trailing slashes ('' when unset). */
export function appBase(appUrl: string | null | undefined): string {
  return (appUrl ?? '').trim().replace(/\/+$/, '')
}

/** Absolute link to the recipe page, or null without a recipe or app address. */
export function recipeLink(appUrl: string | null | undefined, entry: Pick<PlanDisplayEntry, 'recipe_id'> | null | undefined): string | null {
  const base = appBase(appUrl)
  if (!base || !entry?.recipe_id) return null
  return `${base}/recipes/${encodeURIComponent(entry.recipe_id)}`
}

/** Absolute URL of the recipe image (the app's own /api/images proxy), or null. */
export function recipeImageLink(appUrl: string | null | undefined, entry: Pick<PlanDisplayEntry, 'recipe_id' | 'recipe'> | null | undefined): string | null {
  const base = appBase(appUrl)
  const path = entry?.recipe_id ? entry.recipe?.image_url?.trim() : ''
  if (!base || !path || !path.startsWith('/')) return null
  return `${base}${path}`
}

/** One entry per date (the first one wins, like the plan page). */
export function entriesByDate<T extends { date: string }>(entries: T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const e of entries) if (!map.has(e.date)) map.set(e.date, e)
  return map
}
