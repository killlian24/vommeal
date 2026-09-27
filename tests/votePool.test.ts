import { describe, it, expect } from 'vitest'
import { votePool, seededShuffle } from '../lib/votePool'

const TODAY = '2026-09-27'
const opts = { date: '2026-09-29', today: TODAY, rangeStart: '2026-09-28', rangeEnd: '2026-10-04', count: 3 }
const r = (id: string, never_again = false) => ({ id, never_again })
const ids = (xs: { id: string }[]) => xs.map(x => x.id)

describe('votePool', () => {
  it('never offers recipes marked "nicht nochmal"', () => {
    const pool = votePool([r('a', true), r('b'), r('c'), r('d')], [], opts)
    expect(ids(pool)).not.toContain('a')
    expect(pool).toHaveLength(3)
  })

  it('leaves out what is already planned in the range', () => {
    const entries = [{ date: '2026-10-01', recipe_id: 'b' }, { date: '2026-10-10', recipe_id: 'c' }]
    const pool = votePool([r('a'), r('b'), r('c'), r('d')], entries, opts)
    expect(ids(pool)).not.toContain('b')
    expect(ids(pool)).toContain('c') // planned outside the range
  })

  it('skips recently cooked recipes while others are left, then tops up with the oldest', () => {
    const entries = [{ date: '2026-09-20', recipe_id: 'a' }, { date: '2026-09-10', recipe_id: 'b' }]
    expect(ids(votePool([r('a'), r('b'), r('c'), r('d'), r('e')], entries, opts)).sort()).toEqual(['c', 'd', 'e'])
    // Only one fresh recipe: the one cooked longest ago comes next
    expect(ids(votePool([r('a'), r('b'), r('c')], entries, opts))).toEqual(['c', 'b', 'a'])
  })

  it('is the same on both phones, whatever order the recipes come in', () => {
    const recipes = ['k', 'b', 'x', 'd', 'm', 'q', 'a'].map(id => r(id))
    const one = votePool(recipes, [], opts)
    const other = votePool([...recipes].reverse(), [], opts)
    expect(ids(one)).toEqual(ids(other))
    // and differs from day to day
    const days = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'].map(date => ids(votePool(recipes, [], { ...opts, date })).join())
    expect(new Set(days).size).toBeGreaterThan(1)
  })

  it('seededShuffle keeps all items', () => {
    expect(seededShuffle([1, 2, 3, 4], 'x').sort()).toEqual([1, 2, 3, 4])
  })
})
