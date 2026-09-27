// Shopping categories in store order with their German labels (Einkauf and
// the "Zutaten der Woche" sheet).

export const CATEGORY_LABELS: Record<string, string> = {
  produce: '🥦 Obst & Gemüse',
  meat: '🥩 Fleisch & Fisch',
  dairy: '🧀 Milchprodukte & Eier',
  bakery: '🍞 Brot & Nudeln',
  pantry: '🫙 Trockenware & Konserven',
  frozen: '🧊 Tiefkühl',
  beverages: '🥤 Getränke',
  other: '📦 Sonstiges',
}

export const DEFAULT_CATEGORY_ORDER = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other']
export const CATEGORIES = DEFAULT_CATEGORY_ORDER

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
