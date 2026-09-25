import { describe, it, expect } from 'vitest'
import { addDaysIso, inDinnerCategory, pickSuggestions } from '../lib/suggest'
import type { SuggestRecipe } from '../lib/suggest'

const r = (id: string, rating: number | null = null, effort: SuggestRecipe['effort'] = null): SuggestRecipe => ({ id, rating, effort })
const noRandom = () => 0
const ids = (xs: SuggestRecipe[]) => xs.map(x => x.id)

// 2026-09-25 is a Friday, 2026-09-28 a Monday.
const FRIDAY = '2026-09-25'
const MONDAY = '2026-09-28'

describe('pickSuggestions', () => {
  it('never suggests rating 1', () => {
    expect(ids(pickSuggestions([r('bad', 1), r('ok')], [], { today: FRIDAY, count: 3, random: noRandom }))).toEqual(['ok'])
  })

  it('prefers rating ≥ 4, then unrated, then middling', () => {
    const recipes = [r('mid', 3), r('none'), r('top', 5)]
    expect(ids(pickSuggestions(recipes, [], { today: FRIDAY, count: 3, random: noRandom }))).toEqual(['top', 'none', 'mid'])
  })

  it('skips recipes cooked in the last 21 days while others are left', () => {
    const recipes = [r('recent', 5), r('old', 3), r('never')]
    const entries = [
      { date: addDaysIso(FRIDAY, -5), recipe_id: 'recent' },
      { date: addDaysIso(FRIDAY, -30), recipe_id: 'old' },
    ]
    expect(ids(pickSuggestions(recipes, entries, { today: FRIDAY, count: 2, random: noRandom }))).toEqual(['never', 'old'])
  })

  it('tops up small collections with what was cooked longest ago', () => {
    const recipes = [r('a', 5), r('b', 5)]
    const entries = [
      { date: addDaysIso(FRIDAY, -2), recipe_id: 'a' },
      { date: addDaysIso(FRIDAY, -10), recipe_id: 'b' },
    ]
    expect(ids(pickSuggestions(recipes, entries, { today: FRIDAY, count: 1, random: noRandom }))).toEqual(['b'])
  })

  it('skips recipes planned today or in the next 3 days', () => {
    const recipes = [r('today', 5), r('in3', 5), r('in5', 5), r('free')]
    const entries = [
      { date: FRIDAY, recipe_id: 'today' },
      { date: addDaysIso(FRIDAY, 3), recipe_id: 'in3' },
      { date: addDaysIso(FRIDAY, 5), recipe_id: 'in5' },
    ]
    expect(ids(pickSuggestions(recipes, entries, { today: FRIDAY, count: 3, random: noRandom }))).toEqual(['in5', 'free'])
  })

  it('prefers quick recipes Monday to Thursday', () => {
    const recipes = [r('involved', 5, 'involved'), r('quick', null, 'quick')]
    expect(ids(pickSuggestions(recipes, [], { today: MONDAY, count: 1, random: noRandom }))).toEqual(['quick'])
    expect(ids(pickSuggestions(recipes, [], { today: FRIDAY, count: 1, random: noRandom }))).toEqual(['involved'])
  })

  it('uses the injected randomness', () => {
    const recipes = [r('a'), r('b')]
    let n = 0
    const alternating = () => (n++ % 2 === 0 ? 0 : 0.9)
    expect(ids(pickSuggestions(recipes, [], { today: FRIDAY, count: 1, random: alternating }))).toEqual(['b'])
  })

  it('excludes what was just shown and starts over when exhausted', () => {
    const recipes = [r('a', 5), r('b', 4), r('c')]
    expect(ids(pickSuggestions(recipes, [], { today: FRIDAY, count: 1, exclude: new Set(['a']), random: noRandom }))).toEqual(['b'])
    expect(ids(pickSuggestions(recipes, [], { today: FRIDAY, count: 3, exclude: new Set(['a']), random: noRandom }))).toEqual(['a', 'b', 'c'])
  })

  it('returns nothing without recipes', () => {
    expect(pickSuggestions([], [], { today: FRIDAY, count: 1 })).toEqual([])
  })
})

describe('inDinnerCategory', () => {
  it('filters by tag, case-insensitive, and keeps all without a category', () => {
    const recipes = [{ id: 'a', tags: ['Abendessen'] }, { id: 'b', tags: ['Kuchen'] }, { id: 'c' }]
    expect(inDinnerCategory(recipes, 'abendessen').map(x => x.id)).toEqual(['a'])
    expect(inDinnerCategory(recipes, '').map(x => x.id)).toEqual(['a', 'b', 'c'])
  })
})
