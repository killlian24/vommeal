// Keys for comparing shopping entries: case, accents and spacing do not
// matter, and simple German plurals meet their singular (Banane/Bananen,
// Zwiebel/Zwiebeln, Tomate/Tomaten, Ei/Eier). Pure and client-safe;
// unit-tested in tests/shoppingKey.test.ts.

export function normalizeShoppingText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Plurals that do not follow the rules below (after accents are removed)
const IRREGULAR: Record<string, string> = {
  eier: 'ei',
  nusse: 'nuss',
  walnusse: 'walnuss',
  haselnusse: 'haselnuss',
}

/**
 * Singular of the last word, conservatively: only the "-n" plurals of words
 * ending in -e (Tomaten, Bananen, Linsen) or -el (Zwiebeln, Kartoffeln), plus
 * a few irregular ones. "-chen" words (Hähnchen, Kuchen stays) and short
 * words are left alone, and nothing else is guessed, so different foods
 * never share a key.
 */
function singular(word: string): string {
  if (IRREGULAR[word]) return IRREGULAR[word]
  if (word.length < 5 || word.endsWith('chen')) return word
  if (word.endsWith('eln')) return word.slice(0, -1)
  if (word.endsWith('en') && /[^aeiou]en$/.test(word)) {
    const stem = word.slice(0, -1) // "tomate"
    if (stem.endsWith('e')) return stem
  }
  return word
}

/** Merge key for an ingredient / shopping row name. */
export function mergeKey(name: string): string {
  const text = normalizeShoppingText(name)
  const m = text.match(/^(.*?)([a-z]+)$/)
  if (!m) return text
  return m[1] + singular(m[2])
}
