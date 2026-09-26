/**
 * Pure selection logic for the "Zutaten der Woche" review sheet (no React, no fetch).
 * Unit-tested in tests/shoppingSelection.test.ts.
 *
 * An ingredient is selected when
 *  - the user toggled it by hand (override) → that choice wins, or otherwise
 *  - it is 'new' (not a pantry staple, not already on the list) and at least one of its meals is on.
 * Toggling a meal resets the manual choices of its ingredients — except, when turning a meal off,
 * those of ingredients another selected meal still needs: they keep their state.
 */

export type SelItem = {
  key: string
  status: 'new' | 'staple' | 'on_list'
  meal_plan_ids: string[]
}

export type SelMeal = { meal_plan_id: string; added: boolean }

export type Selection = {
  /** Meals currently switched on. */
  on: ReadonlySet<string>
  /** Manual per-ingredient choices (key → selected). */
  overrides: ReadonlyMap<string, boolean>
}

/** Meals not yet shopped for start on; everything else follows from that. */
export function initialSelection(meals: SelMeal[]): Selection {
  return { on: new Set(meals.filter(m => !m.added).map(m => m.meal_plan_id)), overrides: new Map() }
}

/** Selected by default (no manual choice): a new ingredient needed by a meal that is on. */
function defaultSelected(item: SelItem, sel: Selection): boolean {
  return item.status === 'new' && item.meal_plan_ids.some(id => sel.on.has(id))
}

export function isSelected(item: SelItem, sel: Selection): boolean {
  if (item.status === 'on_list') return false
  const manual = sel.overrides.get(item.key)
  return manual ?? defaultSelected(item, sel)
}

/** Flip one ingredient by hand. Rows already on the list cannot be toggled. */
export function toggleItem(item: SelItem, sel: Selection): Selection {
  if (item.status === 'on_list') return sel
  const overrides = new Map(sel.overrides)
  const next = !isSelected(item, sel)
  // Store only real deviations so a later meal toggle has less to reset.
  if (next === defaultSelected(item, sel)) overrides.delete(item.key)
  else overrides.set(item.key, next)
  return { on: sel.on, overrides }
}

/** Switch a meal on or off. */
export function setMealOn(mealId: string, on: boolean, items: SelItem[], sel: Selection): Selection {
  const nextOn = new Set(sel.on)
  if (on) nextOn.add(mealId)
  else nextOn.delete(mealId)
  const overrides = new Map(sel.overrides)
  for (const item of items) {
    if (!item.meal_plan_ids.includes(mealId)) continue
    // Turning off an ingredient another selected meal still needs keeps whatever state it had
    // (its default does not change, and a manual choice stays).
    if (!on && item.meal_plan_ids.some(id => id !== mealId && nextOn.has(id))) continue
    overrides.delete(item.key)
  }
  return { on: nextOn, overrides }
}

/** Switch every given meal on (e.g. "Trotzdem anzeigen"); manual choices are reset. */
export function setAllMealsOn(mealIds: string[], sel: Selection): Selection {
  return { on: new Set([...Array.from(sel.on), ...mealIds]), overrides: new Map() }
}

/**
 * Meals an ingredient is currently "für": the switched-on ones, or all of them when none is on
 * (the ingredient was then picked by hand, or is shown deselected).
 */
export function activeMealIds(item: SelItem, sel: Selection): string[] {
  const on = item.meal_plan_ids.filter(id => sel.on.has(id))
  return on.length > 0 ? on : item.meal_plan_ids
}

/**
 * Ingredients of meals that were already shopped for and are switched off are hidden — unless
 * picked by hand. Ingredients of meals the user just switched off stay visible (deselected).
 */
export function isHidden(item: SelItem, sel: Selection, addedMeals: ReadonlySet<string>): boolean {
  if (isSelected(item, sel)) return false
  return item.meal_plan_ids.every(id => addedMeals.has(id) && !sel.on.has(id))
}

/** "4 von 6" for a meal row. */
export function mealCounts(mealId: string, items: SelItem[], sel: Selection): { selected: number; total: number } {
  let selected = 0
  let total = 0
  for (const item of items) {
    if (!item.meal_plan_ids.includes(mealId)) continue
    total++
    if (isSelected(item, sel)) selected++
  }
  return { selected, total }
}

export type CommitLine = { name: string; category: string; recipe_names: string[]; meal_plan_ids: string[] }

/**
 * What add_selected receives: the selected new/staple ingredients, plus rows already on the list
 * for meals that are on (so those rows learn the meals). Each line only carries the meals it is
 * currently "für", so a meal that is off is not recorded as shopped for.
 */
export function buildCommitLines<T extends SelItem & { name: string; category: string; recipe_names: string[] }>(
  items: T[], sel: Selection, mealNames: ReadonlyMap<string, string>,
): { chosen: T[]; lines: CommitLine[] } {
  const chosen: T[] = []
  const lines: CommitLine[] = []
  const toLine = (item: T, ids: string[]): CommitLine => {
    const names = Array.from(new Set(ids.map(id => mealNames.get(id)).filter((n): n is string => !!n)))
    return { name: item.name, category: item.category, recipe_names: names.length > 0 ? names : item.recipe_names, meal_plan_ids: ids }
  }
  for (const item of items) {
    if (item.status === 'on_list') {
      const ids = item.meal_plan_ids.filter(id => sel.on.has(id))
      if (ids.length > 0) lines.push(toLine(item, ids))
      continue
    }
    if (!isSelected(item, sel)) continue
    chosen.push(item)
    lines.push(toLine(item, activeMealIds(item, sel)))
  }
  return { chosen, lines }
}
