import { describe, it, expect } from 'vitest'
import { autofillCandidates, planAutofill, isWeeknight } from '../lib/autofillPlan'
import type { AutofillRecipe } from '../lib/autofillPlan'

// Deterministic "random" for stable tests.
function seeded(seed = 1) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const r = (id: string, rating: number | null = null, effort: AutofillRecipe['effort'] = null): AutofillRecipe => ({ id, rating, effort })

// 2026-09-28 is a Monday
const WEEK = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']

describe('isWeeknight', () => {
  it('is Monday to Thursday', () => {
    expect(WEEK.map(isWeeknight)).toEqual([true, true, true, true, false, false, false])
  })
})

describe('autofillCandidates', () => {
  it('always drops rating 1', () => {
    expect(autofillCandidates([r('a', 1), r('b', 1), r('c')], 5).map(x => x.id)).toEqual(['c'])
  })

  it('drops rating 2 only while enough others remain', () => {
    const recipes = [r('a', 2), r('b', 5), r('c'), r('d', 1)]
    expect(autofillCandidates(recipes, 2).map(x => x.id)).toEqual(['b', 'c'])
    expect(autofillCandidates(recipes, 3).map(x => x.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('planAutofill', () => {
  it('puts quick recipes on Mon–Thu when enough exist', () => {
    const recipes = [r('q1', null, 'quick'), r('q2', null, 'quick'), r('q3', null, 'quick'), r('q4', null, 'quick'),
      r('i1', null, 'involved'), r('n1'), r('n2')]
    const plan = planAutofill(WEEK, recipes, new Set(), seeded(3))
    expect(plan).toHaveLength(7)
    for (const { date, recipe } of plan) {
      if (isWeeknight(date)) expect(recipe.effort).toBe('quick')
    }
    // no repeats while the pool is large enough
    expect(new Set(plan.map(p => p.recipe.id)).size).toBe(7)
  })

  it('falls back to the whole pool when there are too few quick recipes', () => {
    const recipes = [r('q1', null, 'quick'), r('a'), r('b'), r('c'), r('d')]
    const plan = planAutofill(WEEK.slice(0, 4), recipes, new Set(), seeded(5))
    expect(plan).toHaveLength(4)
    expect(new Set(plan.map(p => p.recipe.id)).size).toBe(4)
  })

  it('prefers recipes not used recently', () => {
    const recipes = [r('old1'), r('old2'), r('new1'), r('new2')]
    const plan = planAutofill(WEEK.slice(4, 6), recipes, new Set(['old1', 'old2']), seeded(7))
    expect(plan.map(p => p.recipe.id).sort()).toEqual(['new1', 'new2'])
  })

  it('repeats only when the pool is too small', () => {
    const plan = planAutofill(WEEK, [r('a'), r('b')], new Set(), seeded(9))
    expect(plan).toHaveLength(7)
    expect(new Set(plan.map(p => p.recipe.id))).toEqual(new Set(['a', 'b']))
  })

  it('handles empty input', () => {
    expect(planAutofill([], [r('a')], new Set())).toEqual([])
    expect(planAutofill(WEEK, [], new Set())).toEqual([])
  })
})
