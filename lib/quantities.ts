/**
 * Ingredient quantity scaling for the shopping list.
 *
 * Countable things (pieces, cloves, cans, eggs with no unit …) are rounded UP to
 * a whole number — you cannot buy half a lemon. Weights and volumes are rounded
 * to at most one decimal so 100 g × (2/3) becomes "66.7" rather than "66.666…".
 * Amounts that are empty, "0" or not numeric are returned unchanged.
 */

// Units that describe discrete items → always round up to a whole number
const COUNTABLE_UNITS = new Set([
  '',
  'stück', 'stk', 'st', 'piece', 'pieces', 'pc', 'pcs',
  'clove', 'cloves', 'zehe', 'zehen',
  'bund', 'bunch', 'bunches',
  'dose', 'dosen', 'can', 'cans', 'tin', 'tins',
  'packung', 'packungen', 'päckchen', 'pck', 'pkg', 'pack', 'packs', 'packet', 'packets',
  'scheibe', 'scheiben', 'slice', 'slices',
  'paar', 'pair', 'pairs',
  'stiel', 'stiele', 'stalk', 'stalks', 'stange', 'stangen',
  'zweig', 'zweige', 'sprig', 'sprigs',
  'blatt', 'blätter', 'leaf', 'leaves',
  'kopf', 'köpfe', 'head', 'heads',
  'knolle', 'knollen', 'bulb', 'bulbs',
  'flasche', 'flaschen', 'bottle', 'bottles',
  'glas', 'gläser', 'jar', 'jars',
  'becher', 'tube', 'tuben', 'beutel', 'tüte', 'tüten', 'bag', 'bags',
  'würfel', 'cube', 'cubes',
])

// Units that describe a measured quantity → round to at most one decimal
const MEASURED_UNITS = new Set([
  'g', 'gr', 'gramm', 'gram', 'grams',
  'kg', 'kilo', 'kilogramm', 'kilogram', 'kilograms',
  'mg',
  'ml', 'milliliter', 'millilitre',
  'l', 'liter', 'litre', 'liters', 'litres',
  'cl', 'dl',
  'el', 'esslöffel', 'tbsp', 'tablespoon', 'tablespoons',
  'tl', 'teelöffel', 'tsp', 'teaspoon', 'teaspoons',
  'cup', 'cups', 'tasse', 'tassen',
  'oz', 'ounce', 'ounces', 'fl oz',
  'lb', 'lbs', 'pound', 'pounds',
  'pfund',
  'prise', 'prisen', 'pinch', 'pinches',
  'msp', 'messerspitze',
  'schuss', 'dash', 'splash',
  'handvoll', 'handful',
])

function normalizeUnit(unit: string | null | undefined): string {
  return (unit ?? '').toLowerCase().trim().replace(/\.$/, '')
}

/** True when the unit describes discrete items (or there is no unit at all). */
export function isCountableUnit(unit: string | null | undefined): boolean {
  const u = normalizeUnit(unit)
  if (COUNTABLE_UNITS.has(u)) return true
  if (MEASURED_UNITS.has(u)) return false
  // Unknown unit: treat as measured (safer than inflating the amount)
  return false
}

/**
 * Parse a human-entered amount: "0.5", "1,5", "1/2", "1 1/2", "2-3" (→ 2).
 * Returns null when nothing numeric can be extracted.
 */
export function parseAmount(amount: string | null | undefined): number | null {
  if (amount == null) return null
  const raw = String(amount).trim().replace(',', '.')
  if (!raw) return null

  // Mixed number "1 1/2" or plain fraction "1/2"
  const mixed = raw.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixed) {
    const den = parseFloat(mixed[3])
    if (!den) return null
    return parseFloat(mixed[1]) + parseFloat(mixed[2]) / den
  }
  const frac = raw.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (frac) {
    const den = parseFloat(frac[2])
    if (!den) return null
    return parseFloat(frac[1]) / den
  }

  // Unicode fractions
  const unicode: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 }
  const uni = raw.match(/^(\d*)\s*([½⅓⅔¼¾⅛])$/)
  if (uni) return (uni[1] ? parseFloat(uni[1]) : 0) + unicode[uni[2]]

  // Leading number (handles "2-3", "400ml" etc.)
  const lead = raw.match(/^-?\d+(?:\.\d+)?/)
  if (!lead) return null
  const n = parseFloat(lead[0])
  return Number.isFinite(n) ? n : null
}

/** Format a number without float noise: 66.7, 2, 0.5 */
export function formatAmount(value: number, countable: boolean): string {
  if (countable) {
    // Round up, but tolerate float noise like 2.0000000001
    const rounded = Math.ceil(value - 1e-9)
    return String(Math.max(rounded, value > 0 ? 1 : 0))
  }
  const oneDecimal = Math.round(value * 10) / 10
  // Avoid "-0" and trailing ".0"
  return String(Number(oneDecimal.toFixed(1)))
}

/**
 * Scale an ingredient amount by `scale` and round it for shopping.
 * - "" stays ""
 * - "0" stays "0"
 * - non-numeric amounts (e.g. "some", "n/a") stay as they are
 */
export function scaleAmount(amount: string | null | undefined, unit: string | null | undefined, scale: number): string {
  const original = (amount ?? '').toString().trim()
  if (!original) return ''

  const value = parseAmount(original)
  if (value === null) return original
  if (value === 0) return original

  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1
  return formatAmount(value * factor, isCountableUnit(unit))
}
