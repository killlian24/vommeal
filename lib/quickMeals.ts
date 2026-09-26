// Plan entries that are not a recipe. Stored as meal_plan.custom_meal_name.
// Shopping generation ignores them (no recipe_id); autofill treats them as filled.
export const QUICK_MEALS = [
  { name: 'Reste', emoji: '🍲' },
  { name: 'Auswärts essen', emoji: '🍽️' },
  { name: 'Bestellen', emoji: '🥡' },
  { name: 'Frei', emoji: '🌙' },
] as const

export type QuickMealName = typeof QUICK_MEALS[number]['name']

/** Filled into an evening that was freed by moving its dinner to later. */
export const EATING_OUT: QuickMealName = 'Auswärts essen'

export function quickMealEmoji(name: string | null | undefined): string | null {
  return QUICK_MEALS.find(q => q.name === name)?.emoji ?? null
}
