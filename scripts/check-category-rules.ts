import { categorizeWithRules } from '../lib/categoryRules.ts'

const cases: Array<[string, string]> = [
  ['tomato', 'produce'],
  ['Tomate', 'produce'],
  ['tomat', 'produce'],
  ['hakkede tomater', 'pantry'],
  ['coconut milk', 'pantry'],
  ['Kokosmilch', 'pantry'],
  ['kokosmælk', 'pantry'],
  ['chicken breast', 'meat'],
  ['Hähnchenbrust', 'meat'],
  ['kyllingebryst', 'meat'],
  ['andebryst', 'meat'],
  ['milk', 'dairy'],
  ['Milch', 'dairy'],
  ['mælk', 'dairy'],
  ['bread', 'bakery'],
  ['Brötchen', 'bakery'],
  ['rugbrød', 'bakery'],
  ['frozen peas', 'frozen'],
  ['tiefkühlgemüse', 'frozen'],
  ['frosne ærter', 'frozen'],
  ['apple juice', 'beverages'],
  ['Apfelsaft', 'beverages'],
  ['æblejuice', 'beverages'],
  ['ras el hanout', 'pantry'],
  ['random mystery item', 'other'],
  ['chips and dip', 'pantry'],
]

for (const [name, expected] of cases) {
  const actual = categorizeWithRules(name)
  if (actual !== expected) {
    console.error(`Expected "${name}" to be ${expected}, got ${actual}`)
    process.exitCode = 1
  }
}

const custom = categorizeWithRules('familieblanding', { frozen: ['familieblanding'] })
if (custom !== 'frozen') {
  console.error(`Expected custom keyword to win, got ${custom}`)
  process.exitCode = 1
}

if (!process.exitCode) {
  console.log(`Category rule check passed (${cases.length + 1} cases)`)
}
