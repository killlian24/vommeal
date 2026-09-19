import { describe, it, expect } from 'vitest'
import {
  parseIngredientText,
  normalizeIngredient,
  normalizeInstructions,
  splitInstructionText,
  countStepMarkers,
} from '../lib/ingredients'

describe('parseIngredientText', () => {
  it('parses "number unit name" lines (German)', () => {
    expect(parseIngredientText('200 g Berglinsen oder kleine Alblinsen'))
      .toEqual({ amount: '200', unit: 'g', name: 'Berglinsen oder kleine Alblinsen' })
    expect(parseIngredientText('600 ml Gemüsebrühe')).toEqual({ amount: '600', unit: 'ml', name: 'Gemüsebrühe' })
    expect(parseIngredientText('1 EL Butterschmalz')).toEqual({ amount: '1', unit: 'EL', name: 'Butterschmalz' })
    expect(parseIngredientText('2 Stiele Thymian')).toEqual({ amount: '2', unit: 'Stiele', name: 'Thymian' })
    expect(parseIngredientText('4 Paar Saitenwürstchen (Wiener Würstchen)'))
      .toEqual({ amount: '4', unit: 'Paar', name: 'Saitenwürstchen (Wiener Würstchen)' })
    expect(parseIngredientText('1 Päckchen Vanillezucker')).toEqual({ amount: '1', unit: 'Päckchen', name: 'Vanillezucker' })
    expect(parseIngredientText('1 Bund Petersilie')).toEqual({ amount: '1', unit: 'Bund', name: 'Petersilie' })
    expect(parseIngredientText('2 Zehen Knoblauch')).toEqual({ amount: '2', unit: 'Zehen', name: 'Knoblauch' })
    expect(parseIngredientText('10 Scheiben Speck')).toEqual({ amount: '10', unit: 'Scheiben', name: 'Speck' })
    expect(parseIngredientText('1 Dose Tomaten (400 g)')).toEqual({ amount: '1', unit: 'Dose', name: 'Tomaten (400 g)' })
    expect(parseIngredientText('1 Prise Salz')).toEqual({ amount: '1', unit: 'Prise', name: 'Salz' })
    expect(parseIngredientText('1 Msp Muskat')).toEqual({ amount: '1', unit: 'Msp', name: 'Muskat' })
    expect(parseIngredientText('1 kg Kartoffeln')).toEqual({ amount: '1', unit: 'kg', name: 'Kartoffeln' })
  })

  it('parses English lines', () => {
    expect(parseIngredientText('2 cups flour')).toEqual({ amount: '2', unit: 'cups', name: 'flour' })
    expect(parseIngredientText('3 cloves garlic')).toEqual({ amount: '3', unit: 'cloves', name: 'garlic' })
    expect(parseIngredientText('1 lb ground beef')).toEqual({ amount: '1', unit: 'lb', name: 'ground beef' })
    expect(parseIngredientText('1 tbsp. olive oil')).toEqual({ amount: '1', unit: 'tbsp', name: 'olive oil' })
    expect(parseIngredientText('2 tsp salt')).toEqual({ amount: '2', unit: 'tsp', name: 'salt' })
    expect(parseIngredientText('8 oz cream cheese')).toEqual({ amount: '8', unit: 'oz', name: 'cream cheese' })
    expect(parseIngredientText('1 can chickpeas')).toEqual({ amount: '1', unit: 'can', name: 'chickpeas' })
    expect(parseIngredientText('2 slices bread')).toEqual({ amount: '2', unit: 'slices', name: 'bread' })
    expect(parseIngredientText('1 piece ginger')).toEqual({ amount: '1', unit: 'piece', name: 'ginger' })
  })

  it('handles numbers without a space before the unit', () => {
    expect(parseIngredientText('200g Mehl')).toEqual({ amount: '200', unit: 'g', name: 'Mehl' })
    expect(parseIngredientText('500ml Milch')).toEqual({ amount: '500', unit: 'ml', name: 'Milch' })
  })

  it('handles decimals with comma and dot', () => {
    expect(parseIngredientText('1,5 l Wasser')).toEqual({ amount: '1.5', unit: 'l', name: 'Wasser' })
    expect(parseIngredientText('0.25 l Milch')).toEqual({ amount: '0.25', unit: 'l', name: 'Milch' })
  })

  it('handles fractions (unicode and slash, incl. mixed numbers)', () => {
    expect(parseIngredientText('½ TL Salz')).toEqual({ amount: '0.5', unit: 'TL', name: 'Salz' })
    expect(parseIngredientText('1/2 Zitrone')).toEqual({ amount: '0.5', unit: '', name: 'Zitrone' })
    expect(parseIngredientText('1 ½ Tassen Mehl')).toEqual({ amount: '1.5', unit: 'Tassen', name: 'Mehl' })
    expect(parseIngredientText('1½ cups sugar')).toEqual({ amount: '1.5', unit: 'cups', name: 'sugar' })
    expect(parseIngredientText('¼ Bund Schnittlauch')).toEqual({ amount: '0.25', unit: 'Bund', name: 'Schnittlauch' })
    expect(parseIngredientText('1/3 cup milk')).toEqual({ amount: '0.33', unit: 'cup', name: 'milk' })
  })

  it('takes the lower bound of ranges', () => {
    expect(parseIngredientText('2-3 EL Olivenöl')).toEqual({ amount: '2', unit: 'EL', name: 'Olivenöl' })
    expect(parseIngredientText('2 – 3 Zehen Knoblauch')).toEqual({ amount: '2', unit: 'Zehen', name: 'Knoblauch' })
    expect(parseIngredientText('2 bis 3 Zehen Knoblauch')).toEqual({ amount: '2', unit: 'Zehen', name: 'Knoblauch' })
    expect(parseIngredientText('1 to 2 tbsp honey')).toEqual({ amount: '1', unit: 'tbsp', name: 'honey' })
  })

  it('ignores "ca." style approximations', () => {
    expect(parseIngredientText('ca. 400 g Hackfleisch')).toEqual({ amount: '400', unit: 'g', name: 'Hackfleisch' })
    expect(parseIngredientText('etwa 200 ml Sahne')).toEqual({ amount: '200', unit: 'ml', name: 'Sahne' })
  })

  it('treats vague quantity words as no amount', () => {
    expect(parseIngredientText('etwas Salz')).toEqual({ amount: '', unit: '', name: 'Salz' })
    expect(parseIngredientText('etwas Pfeffer')).toEqual({ amount: '', unit: '', name: 'Pfeffer' })
    expect(parseIngredientText('einige Blätter Basilikum')).toEqual({ amount: '', unit: '', name: 'Blätter Basilikum' })
    expect(parseIngredientText('nach Bedarf Salz')).toEqual({ amount: '', unit: '', name: 'Salz' })
    expect(parseIngredientText('some parsley')).toEqual({ amount: '', unit: '', name: 'parsley' })
    expect(parseIngredientText('a pinch of salt')).toEqual({ amount: '', unit: '', name: 'salt' })
    // trailing descriptors stay in the name
    expect(parseIngredientText('Salz nach Bedarf')).toEqual({ amount: '', unit: '', name: 'Salz nach Bedarf' })
    expect(parseIngredientText('Salz & Pfeffer nach Geschmack')).toEqual({ amount: '', unit: '', name: 'Salz & Pfeffer nach Geschmack' })
  })

  it('keeps trailing descriptors in the name', () => {
    expect(parseIngredientText('1 Kartoffel, mehligkochend')).toEqual({ amount: '1', unit: '', name: 'Kartoffel, mehligkochend' })
    expect(parseIngredientText('50 g Speck, durchwachsen, geräuchert')).toEqual({ amount: '50', unit: 'g', name: 'Speck, durchwachsen, geräuchert' })
    expect(parseIngredientText('3 Eier (Größe M)')).toEqual({ amount: '3', unit: '', name: 'Eier (Größe M)' })
    expect(parseIngredientText('100 g Suppengemüse (Sellerieknolle, Möhre, Lauch)'))
      .toEqual({ amount: '100', unit: 'g', name: 'Suppengemüse (Sellerieknolle, Möhre, Lauch)' })
  })

  it('handles lines without a number', () => {
    expect(parseIngredientText('Pfeffer')).toEqual({ amount: '', unit: '', name: 'Pfeffer' })
    expect(parseIngredientText('Prise Salz')).toEqual({ amount: '', unit: 'Prise', name: 'Salz' })
    expect(parseIngredientText('Salz')).toEqual({ amount: '', unit: '', name: 'Salz' })
  })

  it('does not treat a unit-like word as a unit when nothing follows it', () => {
    expect(parseIngredientText('1 Glas')).toEqual({ amount: '1', unit: '', name: 'Glas' })
    expect(parseIngredientText('2 Eier')).toEqual({ amount: '2', unit: '', name: 'Eier' })
  })

  it('handles empty input', () => {
    expect(parseIngredientText('')).toEqual({ amount: '', unit: '', name: '' })
    expect(parseIngredientText('   ')).toEqual({ amount: '', unit: '', name: '' })
    expect(parseIngredientText(null)).toEqual({ amount: '', unit: '', name: '' })
    expect(parseIngredientText(undefined)).toEqual({ amount: '', unit: '', name: '' })
  })
})

describe('normalizeIngredient', () => {
  it('parses the stored "unparsed Mealie" shape and drops the redundant note', () => {
    const line = '200 g Berglinsen oder kleine Alblinsen'
    expect(normalizeIngredient({ amount: '0', unit: '', name: line, note: line }))
      .toEqual({ amount: '200', unit: 'g', name: 'Berglinsen oder kleine Alblinsen' })
  })

  it('parses the raw Mealie API shape (quantity 0, food null, display + note)', () => {
    const line = '1 EL Butterschmalz'
    const result = normalizeIngredient({ amount: 0, unit: '', name: '', note: line }, line)
    expect(result).toEqual({ amount: '1', unit: 'EL', name: 'Butterschmalz' })
    expect('note' in result).toBe(false)
  })

  it('maps quantity 0 / null / "0" to an empty amount', () => {
    expect(normalizeIngredient({ amount: 0, unit: 'g', name: 'Salz' })).toEqual({ amount: '', unit: 'g', name: 'Salz' })
    expect(normalizeIngredient({ amount: null, unit: '', name: 'Salz' })).toEqual({ amount: '', unit: '', name: 'Salz' })
    expect(normalizeIngredient({ amount: '0', unit: '', name: 'Salz' })).toEqual({ amount: '', unit: '', name: 'Salz' })
  })

  it('keeps properly parsed ingredients unchanged', () => {
    expect(normalizeIngredient({ amount: '2', unit: 'Stück', name: 'Eier', note: 'Größe M' }))
      .toEqual({ amount: '2', unit: 'Stück', name: 'Eier', note: 'Größe M' })
    expect(normalizeIngredient({ amount: '200', unit: 'g', name: 'Mehl' })).toEqual({ amount: '200', unit: 'g', name: 'Mehl' })
    expect(normalizeIngredient({ amount: '', unit: '', name: 'Salz' })).toEqual({ amount: '', unit: '', name: 'Salz' })
  })

  it('formats numeric quantities from the API', () => {
    expect(normalizeIngredient({ amount: 2, unit: 'EL', name: 'Öl' })).toEqual({ amount: '2', unit: 'EL', name: 'Öl' })
    expect(normalizeIngredient({ amount: 1.5, unit: 'l', name: 'Wasser' })).toEqual({ amount: '1.5', unit: 'l', name: 'Wasser' })
  })

  it('falls back to the Mealie quantity/unit when the display text has none', () => {
    expect(normalizeIngredient({ amount: 2, unit: '', name: '', note: 'Eier' }, 'Eier'))
      .toEqual({ amount: '2', unit: '', name: 'Eier' })
  })

  it('drops the note when it equals the name or the display text (case-insensitive, trimmed)', () => {
    expect(normalizeIngredient({ amount: '1', unit: '', name: 'Zwiebel', note: ' zwiebel ' }))
      .toEqual({ amount: '1', unit: '', name: 'Zwiebel' })
    expect(normalizeIngredient({ amount: '1', unit: '', name: 'Zwiebel', note: '1 Zwiebel' }, '1 Zwiebel'))
      .toEqual({ amount: '1', unit: '', name: 'Zwiebel' })
    expect(normalizeIngredient({ amount: '1', unit: '', name: 'Zwiebel', note: 'fein gewürfelt' }))
      .toEqual({ amount: '1', unit: '', name: 'Zwiebel', note: 'fein gewürfelt' })
  })

  it('handles vague amounts in stored lines', () => {
    expect(normalizeIngredient({ amount: '0', unit: '', name: 'etwas Salz', note: 'etwas Salz' }))
      .toEqual({ amount: '', unit: '', name: 'Salz' })
  })
})

// Shortened version of the real Mealie pattern from "Linsen mit Spätzle und Saitenwürstchen"
const MERGED = '1. Am Vortag die Linsen einweichen, dann abschütten. ,2. Für die Spätzle das Mehl in eine Schüssel geben. ' +
  'Falls der Teig zu fest ist, Mineralwasser zugeben. ,Den Teig abdecken und etwa 30 Minuten ruhen lassen. ' +
  ',3. Das Suppengemüse putzen bzw. schälen und fein würfeln. ,4. In einem Topf 1 EL Butterschmalz erhitzen. ' +
  ',5. Die Kartoffel schälen. ,6. Speck in feine Würfel schneiden. ,7. Thymian abbrausen. ,8. Salzwasser aufkochen. ' +
  ',9. Spätzle schaben. ,10. Butter erhitzen. ,11. Die Würstchen erwärmen. ,12. Alles anrichten. ' +
  ',Tipp: Wer mag, macht eine Mehlschwitze: 2 EL Butterschmalz erhitzen.'

describe('instruction splitting', () => {
  it('counts numbered markers', () => {
    expect(countStepMarkers(MERGED)).toBe(12)
    expect(countStepMarkers('Alles mischen. Fertig.')).toBe(0)
    expect(countStepMarkers('1. Eins\n2. Zwei\n3. Drei')).toBe(3)
  })

  it('splits the real ",N. " pattern into steps and strips the markers', () => {
    const steps = splitInstructionText(MERGED)!
    expect(steps).toHaveLength(12)
    expect(steps[0]).toBe('Am Vortag die Linsen einweichen, dann abschütten.')
    expect(steps[2]).toBe('Das Suppengemüse putzen bzw. schälen und fein würfeln.')
    expect(steps[10]).toBe('Die Würstchen erwärmen.')
    for (const s of steps) expect(s).not.toMatch(/^,?\s*\d+\.\s/)
  })

  it('keeps unnumbered continuation paragraphs inside their step', () => {
    const steps = splitInstructionText(MERGED)!
    expect(steps[1]).toBe(
      'Für die Spätzle das Mehl in eine Schüssel geben. Falls der Teig zu fest ist, Mineralwasser zugeben.\n' +
      'Den Teig abdecken und etwa 30 Minuten ruhen lassen.'
    )
    expect(steps[11]).toBe('Alles anrichten.\nTipp: Wer mag, macht eine Mehlschwitze: 2 EL Butterschmalz erhitzen.')
  })

  it('splits the "\\nN. " pattern too', () => {
    expect(splitInstructionText('1. Eins\n2. Zwei\n3. Drei')).toEqual(['Eins', 'Zwei', 'Drei'])
    expect(splitInstructionText('Zwiebel schneiden.\n2. Anbraten.\n3. Ablöschen.\n4. Servieren.'))
      .toEqual(['Zwiebel schneiden.', 'Anbraten.', 'Ablöschen.', 'Servieren.'])
  })

  it('does not touch decimal numbers or normal commas inside a step', () => {
    const steps = splitInstructionText('1. 1,5 l Wasser, Salz und Öl mischen. ,2. Kochen. ,3. Servieren.')!
    expect(steps).toEqual(['1,5 l Wasser, Salz und Öl mischen.', 'Kochen.', 'Servieren.'])
  })

  it('returns null with fewer than 3 markers', () => {
    expect(splitInstructionText('1. Eins ,2. Zwei')).toBeNull()
    expect(splitInstructionText('Alles verrühren und 20 Min. backen.')).toBeNull()
    expect(splitInstructionText('Ofen auf 180 Grad, 20 Min. vorheizen.')).toBeNull()
  })

  it('normalizeInstructions only splits a single merged instruction', () => {
    expect(normalizeInstructions([{ text: MERGED }])).toHaveLength(12)
    const two = [{ text: '1. Eins ,2. Zwei ,3. Drei' }, { text: 'Vier' }]
    expect(normalizeInstructions(two)).toBe(two)
    const plain = [{ text: 'Alles mischen.' }]
    expect(normalizeInstructions(plain)).toBe(plain)
    expect(normalizeInstructions([])).toEqual([])
  })
})
