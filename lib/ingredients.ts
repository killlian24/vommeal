import type { Ingredient, Instruction } from './db'

// ---------------------------------------------------------------------------
// Tolerant ingredient-line parser for unparsed Mealie ingredients.
//
// Mealie sometimes returns an ingredient with quantity 0, food null and
// unit null, leaving the whole line in `display` / `note`, e.g.
//   "200 g Berglinsen oder kleine Alblinsen"
// This module turns such a line into { amount, unit, name }.
// ---------------------------------------------------------------------------

export type ParsedIngredient = { amount: string; unit: string; name: string }

// Units, matched as a whole word (case-insensitive). Longer forms first so
// e.g. "Päckchen" is not cut to "Pack" by the regex alternation.
const UNITS = [
  // metric weight / volume
  'kg', 'g', 'gr', 'mg', 'l', 'ml', 'cl', 'dl',
  // German kitchen measures
  'el', 'tl', 'msp', 'prise', 'prisen', 'stück', 'stk', 'st',
  'bund', 'bd', 'dose', 'dosen', 'packung', 'packungen', 'pck', 'päckchen', 'pkt',
  'zehe', 'zehen', 'scheibe', 'scheiben', 'paar', 'stiel', 'stiele', 'stängel',
  'zweig', 'zweige', 'blatt', 'blätter', 'tasse', 'tassen', 'becher', 'glas', 'gläser',
  'kopf', 'köpfe', 'knolle', 'knollen', 'würfel', 'tropfen', 'spritzer', 'schuss',
  'handvoll', 'hand voll', 'portion', 'portionen', 'flasche', 'flaschen', 'tüte', 'tüten',
  'beutel', 'riegel', 'tafel', 'tafeln', 'kugel', 'kugeln', 'stange', 'stangen',
  // English kitchen measures
  'cup', 'cups', 'tbsp', 'tbsps', 'tablespoon', 'tablespoons', 'tsp', 'tsps',
  'teaspoon', 'teaspoons', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'piece', 'pieces', 'pc', 'pcs', 'clove', 'cloves', 'can', 'cans', 'tin', 'tins',
  'slice', 'slices', 'bunch', 'bunches', 'pinch', 'pinches', 'dash', 'sprig', 'sprigs',
  'stalk', 'stalks', 'leaf', 'leaves', 'head', 'heads', 'pack', 'packs', 'package',
  'packet', 'packets', 'jar', 'jars', 'bottle', 'bottles', 'stick', 'sticks', 'handful',
  'pint', 'pints', 'quart', 'quarts', 'gallon', 'gallons',
]

// Canonical casing for units we know (parsed text is lower-cased for matching).
const UNIT_CASING: Record<string, string> = {
  el: 'EL', tl: 'TL', msp: 'Msp', prise: 'Prise', prisen: 'Prisen', stück: 'Stück', stk: 'Stk',
  bund: 'Bund', dose: 'Dose', dosen: 'Dosen', packung: 'Packung', packungen: 'Packungen',
  päckchen: 'Päckchen', zehe: 'Zehe', zehen: 'Zehen', scheibe: 'Scheibe', scheiben: 'Scheiben',
  paar: 'Paar', stiel: 'Stiel', stiele: 'Stiele', stängel: 'Stängel', zweig: 'Zweig', zweige: 'Zweige',
  blatt: 'Blatt', blätter: 'Blätter', tasse: 'Tasse', tassen: 'Tassen', becher: 'Becher',
  glas: 'Glas', gläser: 'Gläser', kopf: 'Kopf', köpfe: 'Köpfe', knolle: 'Knolle', knollen: 'Knollen',
  würfel: 'Würfel', tropfen: 'Tropfen', spritzer: 'Spritzer', schuss: 'Schuss', handvoll: 'Handvoll',
  portion: 'Portion', portionen: 'Portionen', flasche: 'Flasche', flaschen: 'Flaschen',
  tüte: 'Tüte', tüten: 'Tüten', beutel: 'Beutel', riegel: 'Riegel', tafel: 'Tafel', tafeln: 'Tafeln',
  kugel: 'Kugel', kugeln: 'Kugeln', stange: 'Stange', stangen: 'Stangen',
}

// Vague quantity words: amount stays "", the rest of the line is the name.
const VAGUE_QUANTITY_WORDS = [
  'etwas', 'einige', 'ein paar', 'ein wenig', 'wenig', 'viel', 'reichlich', 'genug',
  'nach bedarf', 'nach belieben', 'nach geschmack', 'n.b.', 'n. b.', 'bel.',
  'some', 'a few', 'a little', 'a bit of', 'a bit', 'plenty of', 'to taste', 'as needed',
  'a pinch of', 'a handful of',
]

// Trailing words after a vague amount like "Salz nach Geschmack" stay in the name
// (they are descriptors, not a quantity); nothing to do for them here.

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
}
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('')

// A single number token: "200", "1,5", "1.5", "1/2", "½", "1 ½", "1½"
const NUMBER_RE = new RegExp(
  `(\\d+(?:[.,]\\d+)?(?:\\s*/\\s*\\d+)?(?:\\s*[${FRACTION_CHARS}])?|[${FRACTION_CHARS}])`
)
// A number possibly followed by a range: "2-3", "2 – 3", "2 bis 3", "2 to 3", "2 oder 3"
const LEADING_QUANTITY_RE = new RegExp(
  `^\\s*(?:ca\\.?|circa|etwa|approx\\.?|about|~)?\\s*` +
  `${NUMBER_RE.source}` +
  `(?:\\s*(?:-|–|—|bis|to|oder|or)\\s*${NUMBER_RE.source})?` +
  `(?=\\s|$|[a-zA-ZäöüÄÖÜß(])`,
  'i'
)

function parseNumber(token: string): number | null {
  const t = token.trim().replace(',', '.')
  if (!t) return null
  // Unicode fraction only
  if (t.length === 1 && t in UNICODE_FRACTIONS) return UNICODE_FRACTIONS[t]
  // Mixed: "1 ½" or "1½"
  const mixedUnicode = t.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*([${FRACTION_CHARS}])$`))
  if (mixedUnicode) return parseFloat(mixedUnicode[1]) + UNICODE_FRACTIONS[mixedUnicode[2]]
  // Slash fraction: "1/2"
  const slash = t.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (slash) {
    const d = parseInt(slash[2], 10)
    return d === 0 ? null : parseInt(slash[1], 10) / d
  }
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

function formatAmount(n: number): string {
  if (Number.isInteger(n)) return String(n)
  // Up to 2 decimals, drop trailing zeros; "0.5" not "0.50", "0.33" not "0.3333"
  return String(Math.round(n * 100) / 100)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const UNIT_RE = new RegExp(
  `^(${[...UNITS].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})\\.?(?=\\s|$|\\()`,
  'i'
)
const VAGUE_RE = new RegExp(
  `^(${[...VAGUE_QUANTITY_WORDS].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})(?=\\s|$)`,
  'i'
)

function cleanName(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:\-–]+/, '')
    .replace(/[\s,;:]+$/, '')
    .trim()
}

/**
 * Parse a free-text ingredient line into amount / unit / name.
 *
 *   "200 g Berglinsen oder kleine Alblinsen" → { amount: "200", unit: "g", name: "Berglinsen oder kleine Alblinsen" }
 *   "1 Kartoffel, mehligkochend"             → { amount: "1", unit: "", name: "Kartoffel, mehligkochend" }
 *   "etwas Salz"                             → { amount: "", unit: "", name: "Salz" }
 *   "2-3 EL Olivenöl"                        → { amount: "2", unit: "EL", name: "Olivenöl" }
 */
export function parseIngredientText(text: string | null | undefined): ParsedIngredient {
  const raw = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return { amount: '', unit: '', name: '' }

  // Vague quantity word ("etwas Salz", "Salz nach Bedarf" is handled by keeping the name intact)
  const vague = raw.match(VAGUE_RE)
  if (vague) {
    return { amount: '', unit: '', name: cleanName(raw.slice(vague[0].length)) || cleanName(raw) }
  }

  const qty = raw.match(LEADING_QUANTITY_RE)
  if (!qty) {
    // No leading number — maybe a bare unit like "Prise Salz"
    const unitOnly = raw.match(UNIT_RE)
    if (unitOnly && cleanName(raw.slice(unitOnly[0].length))) {
      return { amount: '', unit: canonicalUnit(unitOnly[1]), name: cleanName(raw.slice(unitOnly[0].length)) }
    }
    return { amount: '', unit: '', name: cleanName(raw) }
  }

  // Ranges: take the first number ("2-3" → 2)
  const n = parseNumber(qty[1])
  let rest = raw.slice(qty[0].length).trim()
  if (n === null || !rest) {
    // Number could not be parsed, or the line is only a number: keep line as name
    return { amount: n !== null ? formatAmount(n) : '', unit: '', name: cleanName(rest || raw) }
  }
  const amount = formatAmount(n)

  // Unit directly after the number, e.g. "g", "EL", "Stiele", "Päckchen", "cup"
  let unit = ''
  const u = rest.match(UNIT_RE)
  if (u) {
    const after = cleanName(rest.slice(u[0].length))
    // "1 Glas" with nothing after it is a name, not a unit; "1 Dose Tomaten" is unit + name.
    if (after) {
      unit = canonicalUnit(u[1])
      rest = after
    }
  }

  return { amount, unit, name: cleanName(rest) }
}

function canonicalUnit(u: string): string {
  const key = u.toLowerCase()
  return UNIT_CASING[key] ?? key
}

function eqText(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Normalize an ingredient the way Mealie (or an older sync) may have stored it:
 *  - amount "0" / 0 / null → ""
 *  - name that is really a full line ("200 g Berglinsen…") is parsed into
 *    amount/unit/name when the ingredient has no amount and unit yet
 *  - note dropped when it equals the name or the original line
 */
export function normalizeIngredient(
  ing: { amount?: string | number | null; unit?: string | null; name?: string | null; note?: string | null },
  display?: string | null
): Ingredient {
  let amount = ing.amount == null ? '' : String(ing.amount).trim()
  if (amount === '0' || amount === '0.0' || Number(amount) === 0) amount = ''
  let unit = (ing.unit ?? '').trim()
  let name = (ing.name ?? '').replace(/\s+/g, ' ').trim()
  const originalName = name
  const note = (ing.note ?? '').trim()

  if (!amount && !unit && name) {
    // The name may be a whole line ("1 EL Butterschmalz"): try to parse it.
    const parsed = parseIngredientText(name)
    if (parsed.name && (parsed.amount || parsed.unit || parsed.name !== name)) {
      amount = parsed.amount
      unit = parsed.unit
      name = parsed.name
    }
  } else if (!name && display) {
    // No food attached (Mealie could not parse the line): use the display text,
    // falling back to whatever quantity/unit Mealie did manage to extract.
    const parsed = parseIngredientText(display)
    amount = parsed.amount || amount
    unit = parsed.unit || unit
    name = parsed.name
  }

  const result: Ingredient = { amount, unit, name }
  if (note && !eqText(note, name) && !eqText(note, originalName) && !eqText(note, display)) {
    result.note = note
  }
  return result
}

// ---------------------------------------------------------------------------
// Instructions: Mealie occasionally delivers a whole recipe as ONE step whose
// text contains the numbered steps joined with ",N. " (or "\nN. ").
// ---------------------------------------------------------------------------

// A marker is ",N. " / "\nN. " / start-of-text "N. " with N a 1-3 digit number.
const STEP_MARKER_RE = /(?:^|,|\n)\s*(\d{1,3})\.\s+(?=\S)/g

/**
 * Count numbered step markers in a text (",2. ", "\n3. ", leading "1. ").
 */
export function countStepMarkers(text: string): number {
  return (text.match(STEP_MARKER_RE) ?? []).length
}

/**
 * Split one merged instruction text into steps. Returns null if the text does
 * not look like a merged list (fewer than 3 markers).
 */
export function splitInstructionText(text: string): string[] | null {
  if (countStepMarkers(text) < 3) return null

  const parts: string[] = []
  let lastIndex = 0
  let current: string | null = null
  const re = new RegExp(STEP_MARKER_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(lastIndex, m.index)
    if (current === null) {
      // Text before the first marker (rare): keep as its own step
      if (before.trim()) parts.push(before)
    } else {
      current += before
      parts.push(current)
    }
    current = ''
    lastIndex = m.index + m[0].length
  }
  if (current !== null) current += text.slice(lastIndex)
  if (current && current.trim()) parts.push(current)

  return parts
    .map(p =>
      p
        // Unnumbered paragraphs within a step were joined with " ," — turn them into line breaks
        .replace(/\s*,(?=[^\s,.;:\d])/g, '\n')
        .replace(/^[\s,]+|[\s,]+$/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .trim()
    )
    .filter(Boolean)
}

/**
 * If a recipe has exactly one instruction that is a merged numbered list,
 * return it split into steps; otherwise return the instructions unchanged.
 */
export function normalizeInstructions(instructions: Instruction[]): Instruction[] {
  if (instructions.length !== 1) return instructions
  const split = splitInstructionText(instructions[0]?.text ?? '')
  if (!split || split.length < 2) return instructions
  return split.map(text => ({ text }))
}
