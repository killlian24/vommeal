import { describe, it, expect } from 'vitest'
import { categorizeWithRules, sanitizeCustomCategoryKeywords } from '../lib/categoryRules'
import type { CategoryId, CategoryKeywordMap } from '../lib/categoryRules'

function expectAll(cases: Record<string, CategoryId>, custom: CategoryKeywordMap = {}) {
  for (const [name, category] of Object.entries(cases)) {
    expect(categorizeWithRules(name, custom), `"${name}" should be ${category}`).toBe(category)
  }
}

describe('categorizeWithRules – cases from scripts/check-category-rules.ts', () => {
  it('English / German / Danish built-in keywords', () => {
    expectAll({
      tomato: 'produce', Tomate: 'produce', tomat: 'produce',
      'hakkede tomater': 'pantry',
      'coconut milk': 'pantry', Kokosmilch: 'pantry', kokosmælk: 'pantry',
      'chicken breast': 'meat', Hähnchenbrust: 'meat', kyllingebryst: 'meat', andebryst: 'meat',
      milk: 'dairy', Milch: 'dairy', mælk: 'dairy',
      bread: 'bakery', Brötchen: 'bakery', rugbrød: 'bakery',
      'frozen peas': 'frozen', tiefkühlgemüse: 'frozen', 'frosne ærter': 'frozen',
      'apple juice': 'beverages', Apfelsaft: 'beverages', æblejuice: 'beverages',
      'ras el hanout': 'pantry',
      'random mystery item': 'other', 'chips and dip': 'other',
    })
  })

  it('custom keywords from settings win over built-in rules', () => {
    expect(categorizeWithRules('familieblanding', { frozen: ['familieblanding'] })).toBe('frozen')
    // custom rule overriding a built-in match
    expect(categorizeWithRules('Tofu', { other: ['tofu'] })).toBe('other')
    expect(categorizeWithRules('Tofu')).toBe('dairy')
  })

  it('sanitizeCustomCategoryKeywords drops junk', () => {
    expect(sanitizeCustomCategoryKeywords(null)).toEqual({})
    expect(sanitizeCustomCategoryKeywords({ frozen: [' a ', '', 1, 'a'], bogus: ['x'], meat: 'nope' }))
      .toEqual({ frozen: ['a'] })
  })
})

describe('categorizeWithRules – regressions from git history', () => {
  it('does not put Fleisch into frozen via "eis"', () => {
    expectAll({ Fleisch: 'meat', Rinderhackfleisch: 'meat', Hackfleisch: 'meat', Schweinefleisch: 'meat' })
  })

  it('keeps real frozen items frozen', () => {
    expectAll({ Eiscreme: 'frozen', 'Ice cream': 'frozen', Eiswürfel: 'frozen', Tiefkühlerbsen: 'frozen' })
  })

  it('puts Flammkuchenteig into bakery, not meat via "lamm"', () => {
    expectAll({ Flammkuchenteig: 'bakery', Flammkuchen: 'bakery', Pizzateig: 'bakery', Lammkeule: 'meat' })
  })

  it('puts Obst / Gemüse / Früchte into produce', () => {
    expectAll({ Obst: 'produce', Gemüse: 'produce', Früchte: 'produce', 'Obst nach Wahl': 'produce' })
  })

  it('puts Fisch into meat', () => {
    expectAll({ Fisch: 'meat', Fischfilet: 'meat', Lachs: 'meat', Thunfisch: 'meat' })
  })

  it('puts Gemüsebrühe / vegetable stock into pantry, not produce', () => {
    expectAll({ Gemüsebrühe: 'pantry', 'vegetable stock': 'pantry', Hühnerbrühe: 'pantry', Rinderfond: 'pantry' })
  })

  it('puts Paprikapulver into pantry, fresh Paprika into produce', () => {
    expectAll({ Paprikapulver: 'pantry', 'Paprikapulver edelsüß': 'pantry', Paprika: 'produce', 'rote Paprika': 'produce' })
  })

  it('does not put Kohlensäure into produce via "kohl"', () => {
    expectAll({ 'Mineralwasser mit Kohlensäure': 'beverages', Rotkohl: 'produce', Wirsing: 'produce' })
  })

  it('matches "ei" only as a whole word', () => {
    expectAll({ Ei: 'dairy', Eier: 'dairy', '3 Eier (Größe M)': 'dairy', 'kleine Zwiebel': 'produce', Weißwein: 'beverages' })
  })
})

describe('categorizeWithRules – manual check fixes', () => {
  it('Tofu / Räuchertofu / Tempeh → dairy (chilled section)', () => {
    expectAll({ Tofu: 'dairy', Räuchertofu: 'dairy', Tempeh: 'dairy', 'Tofu natur': 'dairy', Seidentofu: 'dairy' })
  })

  it('nuts → pantry', () => {
    expectAll({
      Nüsse: 'pantry', Nuts: 'pantry', 'mixed nuts': 'pantry', Cashewkerne: 'pantry', Walnüsse: 'pantry',
      Mandeln: 'pantry', Haselnüsse: 'pantry', Erdnüsse: 'pantry', Nussmischung: 'pantry', Pistazien: 'pantry',
      'gehackte Mandeln': 'pantry', Walnusskerne: 'pantry',
    })
  })

  it('English "nut" is only matched as a whole word', () => {
    expectAll({ 'Butternut squash': 'produce', 'coconut milk': 'pantry', 'minute steak': 'meat', Donut: 'other' })
  })

  it('rice → pantry', () => {
    expectAll({
      Reis: 'pantry', Basmati: 'pantry', Basmatireis: 'pantry', Jasminreis: 'pantry',
      Vollkornreis: 'pantry', Risottoreis: 'pantry', Risotto: 'pantry', rice: 'pantry',
    })
  })

  it('nut butters → pantry (before the dairy "butter" match)', () => {
    expectAll({
      Erdnussbutter: 'pantry', Mandelmus: 'pantry', Cashewmus: 'pantry', 'peanut butter': 'pantry',
      'almond butter': 'pantry', Tahini: 'pantry', Butter: 'dairy', 'Butter, weich': 'dairy',
    })
  })

  it('juices → beverages (before produce)', () => {
    expectAll({
      Orangensaft: 'beverages', Apfelsaft: 'beverages', Zitronensaft: 'beverages', Traubensaft: 'beverages',
      'orange juice': 'beverages', 'apple juice': 'beverages', 'Erdbeer-Smoothie': 'beverages',
      Orange: 'produce', Apfel: 'produce',
    })
  })

  it('"TK" as a whole token and "tiefkühl" → frozen', () => {
    expectAll({
      'TK Erbsen': 'frozen', 'Erbsen TK': 'frozen', 'TK-Spinat': 'frozen', 'Himbeeren (TK)': 'frozen',
      'tk himbeeren': 'frozen', Tiefkühlspinat: 'frozen', 'Tiefkühl-Erbsen': 'frozen', 'Blattspinat, tiefgekühlt': 'frozen',
      // "tk" inside a word must not trigger frozen
      Erbsen: 'produce', Spinat: 'produce', Artischocken: 'produce',
    })
  })

  it('canned / jarred goods → pantry', () => {
    expectAll({
      'Tomaten (Dose)': 'pantry', 'Tomaten Dose': 'pantry', 'Mais (Dose)': 'pantry', 'Kichererbsen Dose': 'pantry',
      'Gurken im Glas': 'pantry', 'Bohnen (Konserve)': 'pantry', 'canned tomatoes': 'pantry', 'Kokosmilch (Dose)': 'pantry',
      Dosentomaten: 'pantry', Dosenmais: 'pantry', 'Ananas aus der Dose': 'pantry', '1 tin tomatoes': 'pantry',
      'Artichokes in a jar': 'pantry',
      // whole-word: Glasnudeln are noodles, fresh tomatoes are produce
      Glasnudeln: 'bakery', Tomaten: 'produce', Mais: 'produce', Gurke: 'produce',
    })
  })

  it('pulses dried or canned → pantry', () => {
    expectAll({
      Kichererbsen: 'pantry', Linsen: 'pantry', 'rote Linsen': 'pantry', Berglinsen: 'pantry',
      Kidneybohnen: 'pantry', 'weiße Bohnen': 'pantry', 'schwarze Bohnen': 'pantry',
      chickpeas: 'pantry', lentils: 'pantry', 'black beans': 'pantry',
      // fresh beans and peas stay produce
      'grüne Bohnen': 'produce', 'green beans': 'produce', Erbsen: 'produce', Bohnensprossen: 'produce',
    })
  })

  it('strips "gehackt" participles before matching', () => {
    expectAll({
      'gehackte Mandeln': 'pantry', 'Petersilie, gehackt': 'produce', 'gehackte Kräuter': 'other',
      'gehackter Knoblauch': 'produce', 'gehackten Walnüssen': 'pantry',
      // minced meat forms are untouched
      Gehacktes: 'meat', Hackfleisch: 'meat', 'gehackt': 'other',
    })
  })
})

describe('categorizeWithRules – existing behaviour is preserved', () => {
  it('produce', () => {
    expectAll({ Zwiebel: 'produce', 'Kartoffel, mehligkochend': 'produce', Knoblauch: 'produce', Petersilie: 'produce', Zitrone: 'produce' })
  })
  it('meat', () => {
    expectAll({ Hähnchenbrust: 'meat', 'Saitenwürstchen (Wiener Würstchen)': 'meat', Speck: 'meat', Salami: 'meat' })
  })
  it('dairy', () => {
    expectAll({ Milch: 'dairy', Sahne: 'dairy', Parmesan: 'dairy', Joghurt: 'dairy', Feta: 'dairy' })
  })
  it('bakery', () => {
    expectAll({ Mehl: 'bakery', Spätzle: 'bakery', Brot: 'bakery', Nudeln: 'bakery', Speisestärke: 'bakery' })
  })
  it('pantry', () => {
    expectAll({ Salz: 'pantry', Pfeffer: 'pantry', Olivenöl: 'pantry', Balsamessig: 'pantry', Zucker: 'pantry', Kokosmilch: 'pantry', 'soy sauce': 'pantry' })
  })
  it('beverages', () => {
    expectAll({ Wasser: 'beverages', Rotwein: 'beverages', Bier: 'beverages', Kaffee: 'beverages' })
  })
  it('other', () => {
    expectAll({ Backpapier: 'other', Zahnstocher: 'other', '': 'other', '   ': 'other' })
  })
})
