// Plan entries that are not a recipe. Stored as meal_plan.custom_meal_name.
// Shopping generation ignores them (no recipe_id); autofill treats them as filled.
export const QUICK_MEALS = [
  { name: 'Reste', emoji: '🍲' },
  { name: 'Auswärts essen', emoji: '🍽️' },
  { name: 'Bestellen', emoji: '🥡' },
  { name: 'Nichts kochen', emoji: '🌙' },
] as const

export type QuickMealName = typeof QUICK_MEALS[number]['name']

/** Filled into an evening that was freed by moving its dinner to later. */
export const EATING_OUT: QuickMealName = 'Auswärts essen'

/** Evenings planned before the rename still say "Frei". */
const LEGACY_NAMES: Record<string, QuickMealName> = { Frei: 'Nichts kochen' }

/** Quick options that mean nobody cooks (nothing to move to tomorrow). */
export const NO_COOKING: string[] = [EATING_OUT, 'Bestellen', 'Nichts kochen', 'Frei']

export function quickMealEmoji(name: string | null | undefined): string | null {
  const n = name ? LEGACY_NAMES[name] ?? name : name
  return QUICK_MEALS.find(q => q.name === n)?.emoji ?? null
}
