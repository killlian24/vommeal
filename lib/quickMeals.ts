// Plan entries that are not a recipe. Stored as meal_plan.custom_meal_name.
// Shopping generation ignores them (no recipe_id); autofill treats them as filled.
export const QUICK_MEALS = [
  { name: 'Reste', emoji: '🍲' },
  { name: 'Auswärts essen', emoji: '🍽️' },
  { name: 'Bestellen', emoji: '🥡' },
  { name: 'Frei', emoji: '🌙' },
] as const

export type QuickMealName = typeof QUICK_MEALS[number]['name']

export function quickMealEmoji(name: string | null | undefined): string | null {
  return QUICK_MEALS.find(q => q.name === name)?.emoji ?? null
}
