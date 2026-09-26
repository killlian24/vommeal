import { describe, it, expect } from 'vitest'
import {
  initialSelection, isSelected, toggleItem, setMealOn, setAllMealsOn, activeMealIds, isHidden,
  mealCounts, buildCommitLines, type Selection,
} from '../lib/shoppingSelection'

type Item = { key: string; name: string; category: string; recipe_names: string[]; status: 'new' | 'staple' | 'on_list'; meal_plan_ids: string[] }
const item = (key: string, meal_plan_ids: string[], status: Item['status'] = 'new'): Item =>
  ({ key, name: key, category: 'other', recipe_names: [], status, meal_plan_ids })

// A = Linsen, B = Curry (both open), C = Pasta (already shopped for)
const items: Item[] = [
  item('linsen', ['A']),
  item('zwiebel', ['A', 'B']),
  item('kokosmilch', ['B']),
  item('oel', ['A'], 'staple'),
  item('reis', ['B'], 'on_list'),
  item('nudeln', ['C']),
  item('tomate', ['B', 'C']),
]
const meals = [
  { meal_plan_id: 'A', added: false },
  { meal_plan_id: 'B', added: false },
  { meal_plan_id: 'C', added: true },
]
const names = new Map([['A', 'Linsen'], ['B', 'Curry'], ['C', 'Pasta']])
const get = (key: string) => items.find(i => i.key === key)!
const selectedKeys = (sel: Selection) => items.filter(i => isSelected(i, sel)).map(i => i.key)

describe('review selection', () => {
  it('starts with open meals on and their new ingredients selected', () => {
    const sel = initialSelection(meals)
    expect(Array.from(sel.on).sort()).toEqual(['A', 'B'])
    expect(selectedKeys(sel)).toEqual(['linsen', 'zwiebel', 'kokosmilch', 'tomate'])
    expect(isHidden(get('nudeln'), sel, new Set(['C']))).toBe(true)
    expect(isHidden(get('tomate'), sel, new Set(['C']))).toBe(false)
  })

  it('turning a meal off keeps ingredients another selected meal needs', () => {
    const sel = setMealOn('A', false, items, initialSelection(meals))
    expect(selectedKeys(sel)).toEqual(['zwiebel', 'kokosmilch', 'tomate'])
    // "für …" drops the switched-off meal
    expect(activeMealIds(get('zwiebel'), sel)).toEqual(['B'])
    // ingredients only of the switched-off meal stay visible (deselected), with their meal
    expect(isHidden(get('linsen'), sel, new Set(['C']))).toBe(false)
    expect(activeMealIds(get('linsen'), sel)).toEqual(['A'])
  })

  it('turning a meal on re-selects its ingredients except staples and rows on the list', () => {
    let sel = initialSelection(meals)
    sel = setMealOn('C', true, items, sel)
    expect(selectedKeys(sel)).toContain('nudeln')
    sel = setMealOn('A', false, items, sel)
    sel = setMealOn('A', true, items, sel)
    expect(isSelected(get('linsen'), sel)).toBe(true)
    expect(isSelected(get('oel'), sel)).toBe(false)
    expect(isSelected(get('reis'), sel)).toBe(false)
  })

  it('manual toggles win until the meal is toggled again', () => {
    let sel = initialSelection(meals)
    sel = toggleItem(get('linsen'), sel) // have Linsen at home
    expect(isSelected(get('linsen'), sel)).toBe(false)
    sel = setMealOn('B', false, items, sel) // unrelated meal: no effect
    expect(isSelected(get('linsen'), sel)).toBe(false)
    sel = setMealOn('A', false, items, sel)
    sel = setMealOn('A', true, items, sel) // meal toggled again → back to default
    expect(isSelected(get('linsen'), sel)).toBe(true)

    // a manual pick of an ingredient of a switched-off meal sticks until that meal is toggled
    sel = setMealOn('A', false, items, sel)
    sel = toggleItem(get('linsen'), sel)
    expect(isSelected(get('linsen'), sel)).toBe(true)
    sel = toggleItem(get('oel'), initialSelection(meals))
    expect(isSelected(get('oel'), sel)).toBe(true) // staple picked by hand
  })

  it('a manually deselected shared ingredient stays deselected when one of its meals goes off', () => {
    let sel = initialSelection(meals)
    sel = toggleItem(get('zwiebel'), sel)
    sel = setMealOn('A', false, items, sel)
    expect(isSelected(get('zwiebel'), sel)).toBe(false)
    // …while a hand pick of an ingredient only the switched-off meal needs is reset
    sel = toggleItem(get('oel'), initialSelection(meals))
    sel = setMealOn('A', false, items, sel)
    expect(isSelected(get('oel'), sel)).toBe(false)
  })

  it('rows already on the list cannot be toggled', () => {
    const sel = initialSelection(meals)
    expect(toggleItem(get('reis'), sel)).toBe(sel)
  })

  it('counts selected ingredients per meal', () => {
    let sel = initialSelection(meals)
    expect(mealCounts('A', items, sel)).toEqual({ selected: 2, total: 3 })
    sel = toggleItem(get('linsen'), sel)
    expect(mealCounts('A', items, sel)).toEqual({ selected: 1, total: 3 })
    expect(mealCounts('C', items, sel)).toEqual({ selected: 1, total: 2 }) // tomate via B
  })

  it('setAllMealsOn switches everything on and resets manual choices', () => {
    let sel = toggleItem(get('linsen'), initialSelection(meals))
    sel = setAllMealsOn(['A', 'B', 'C'], sel)
    expect(sel.overrides.size).toBe(0)
    expect(selectedKeys(sel)).toEqual(['linsen', 'zwiebel', 'kokosmilch', 'nudeln', 'tomate'])
  })

  it('commit lines only name the meals that are on', () => {
    let sel = setMealOn('A', false, items, initialSelection(meals))
    sel = toggleItem(get('linsen'), sel) // picked by hand although A is off
    const { chosen, lines } = buildCommitLines(items, sel, names)
    expect(chosen.map(i => i.key)).toEqual(['linsen', 'zwiebel', 'kokosmilch', 'tomate'])
    const byName = new Map(lines.map(l => [l.name, l]))
    expect(byName.get('zwiebel')).toMatchObject({ meal_plan_ids: ['B'], recipe_names: ['Curry'] })
    expect(byName.get('tomate')).toMatchObject({ meal_plan_ids: ['B'], recipe_names: ['Curry'] })
    expect(byName.get('linsen')).toMatchObject({ meal_plan_ids: ['A'], recipe_names: ['Linsen'] })
    // on-list row is sent for the meals that are on, so it learns them
    expect(byName.get('reis')).toMatchObject({ meal_plan_ids: ['B'] })
    expect(byName.has('oel')).toBe(false)
    expect(byName.has('nudeln')).toBe(false)
  })

  it('an on-list row whose meals are all off is not sent', () => {
    const sel = setMealOn('B', false, items, initialSelection(meals))
    expect(buildCommitLines(items, sel, names).lines.some(l => l.name === 'reis')).toBe(false)
  })
})
