import { describe, it, expect } from 'vitest'
import { mergeKey, normalizeShoppingText } from '../lib/shoppingKey'

const same = (a: string, b: string) => expect(mergeKey(a)).toBe(mergeKey(b))
const differ = (a: string, b: string) => expect(mergeKey(a)).not.toBe(mergeKey(b))

describe('mergeKey', () => {
  it('ignores case, accents and spacing', () => {
    same('Milch', ' milch ')
    same('Crème  fraîche', 'creme fraiche')
    expect(normalizeShoppingText('  Äpfel ')).toBe('apfel')
  })

  it('brings simple German plurals to the singular', () => {
    same('Banane', 'Bananen')
    same('Zwiebel', 'Zwiebeln')
    same('Tomate', 'Tomaten')
    same('Ei', 'Eier')
    same('Karotte', 'Karotten')
    same('Kartoffel', 'Kartoffeln')
    same('rote Zwiebel', 'rote Zwiebeln')
    same('Bio-Eier', 'Bio-Ei')
    same('Apfel', 'Äpfel')
    same('Haselnuss', 'Haselnüsse')
  })

  it('stays conservative', () => {
    differ('Ei', 'Eis')
    differ('Hähnchen', 'Hähnche')
    expect(mergeKey('Kuchen')).toBe('kuchen')
    expect(mergeKey('Hähnchen')).toBe('hahnchen')
    differ('Reis', 'Rei')
    differ('Brot', 'Brote')
    differ('Rind', 'Rinde')
    expect(mergeKey('Mais')).toBe('mais')
  })
})
