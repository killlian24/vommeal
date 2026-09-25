import { randomUUID } from 'crypto'
import { addDays, eachDayOfInterval, format, parseISO } from 'date-fns'
import { addMealPlanEntry, getAllRecipes, getMealPlanRange, getSetting } from './db'
import { todayInTimezone } from './config'
import { autofillCandidates, planAutofill } from './autofillPlan'
import { inDinnerCategory } from './suggest'

/**
 * Fill the empty evenings between start and end (inclusive) with recipes.
 * Shared by POST /api/meal-plan/autofill and the "Woche füllen" notification
 * button. The pure planning lives in lib/autofillPlan.ts.
 */

export type AutofillResult =
  | { ok: true; filled: number; message?: string }
  | { ok: false; error: string }

export function autofillRange(
  rawStart: string,
  end: string,
  suggestedBy: string,
  opts: { today?: string; random?: () => number } = {},
): AutofillResult {
  // Never fill days that are already in the past (household time zone).
  const todayStr = opts.today ?? todayInTimezone()
  const start = rawStart < todayStr ? todayStr : rawStart
  if (start > end) return { ok: true, filled: 0, message: 'Keine kommenden Tage in diesem Zeitraum' }

  // Any entry fills its day, including quick meals (Reste, Bestellen, …).
  const existing = getMealPlanRange(start, end)
  const filledDates = new Set(existing.map(e => e.date))
  const emptyDates = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) })
    .map(d => format(d, 'yyyy-MM-dd'))
    .filter(d => !filledDates.has(d))
  if (emptyDates.length === 0) return { ok: true, filled: 0, message: 'Alle Tage sind schon geplant' }

  // All recipes, filtered by the dinner category when one is configured
  const dinnerCategory = getSetting('dinner_category') || ''
  const recipes = inDinnerCategory(getAllRecipes(), dinnerCategory)
  if (recipes.length === 0) {
    return { ok: false, error: `Keine Rezepte mit der Kategorie „${dinnerCategory}“ – Kategorie in den Einstellungen ändern oder Rezepte zuordnen` }
  }

  // Rating 1 is always out; rating 2 only while enough others remain.
  const candidates = autofillCandidates(recipes, emptyDates.length)
  if (candidates.length === 0) return { ok: false, error: 'Keine passenden Rezepte zum Auffüllen gefunden' }

  // Avoid repeating recipes already used this week or in the previous 14 days
  const lookbackStart = format(addDays(parseISO(start), -14), 'yyyy-MM-dd')
  const recent = getMealPlanRange(lookbackStart, format(addDays(parseISO(start), -1), 'yyyy-MM-dd'))
  const usedRecipeIds = new Set(
    [...existing, ...recent].map(e => e.recipe_id).filter((id): id is string => !!id)
  )

  const plan = planAutofill(emptyDates, candidates, usedRecipeIds, opts.random)
  for (const { date, recipe } of plan) {
    addMealPlanEntry({
      id: randomUUID(),
      date,
      meal_type: 'dinner',
      recipe_id: recipe.id,
      custom_meal_name: null,
      servings: 2,
      notes: '',
      suggested_by: suggestedBy,
      status: 'approved',
    })
  }
  return { ok: true, filled: plan.length }
}
