import { describe, it, expect, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { format, addDays } from 'date-fns'

// Fresh database in a temp dir, never the real one; Home Assistant stays unconfigured.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vommeal-shopmeals-'))
process.env.DATA_DIR = tmpDir
for (const key of ['HA_URL', 'HA_TOKEN', 'HA_ENTITY', 'MEALIE_URL', 'MEALIE_TOKEN']) delete process.env[key]

// The route imports through the "@/…" alias, which vitest does not resolve here.
vi.mock('@/lib/db', () => import('../lib/db'))
vi.mock('@/lib/config', () => import('../lib/config'))
vi.mock('@/lib/categorize', () => import('../lib/categorize'))
vi.mock('@/lib/ha', () => import('../lib/ha'))
vi.mock('@/lib/shoppingMeals', () => import('../lib/shoppingMeals'))

const db = await import('../lib/db')
const meals = await import('../lib/shoppingMeals')
const route = await import('../app/api/shopping/route')

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const day = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd')
const END = day(6)

async function post(body: unknown) {
  const res = await route.POST({ json: async () => body } as never)
  return { status: res.status, data: await res.json() }
}

function recipe(id: string, name: string, ingredients: string[]) {
  db.upsertRecipe({ id, name, ingredients: ingredients.map(n => ({ amount: '', unit: '', name: n })) })
}

function plan(id: string, date: string, recipe_id: string) {
  db.addMealPlanEntry({
    id, date, meal_type: 'dinner', recipe_id, custom_meal_name: null,
    servings: 2, notes: '', status: 'approved', suggested_by: '',
  })
}

function row(id: string, name: string, mealIds: string[], recipeNames: string[], checked = false) {
  db.addShoppingItem({
    id, name, amount: '', unit: '', category: 'other', checked, source: 'meal_plan',
    meal_plan_id: mealIds[0] ?? null, ha_uid: null, sort_order: 0,
    meal_plan_ids: mealIds, recipe_names: recipeNames,
  })
}

type Meal = { meal_plan_id: string; added: boolean; item_count: number; thin: boolean; date: string; name: string }
type Item = { key: string; name: string; added: boolean; status: string; meal_plan_ids: string[] }

async function preview() {
  const { data } = await post({ action: 'preview', start: day(0), end: END })
  const byMeal = new Map((data.meals as Meal[]).map(m => [m.meal_plan_id, m]))
  const byName = new Map((data.items as Item[]).map(i => [i.name, i]))
  return { data, byMeal, byName }
}

// Data used across the tests (run in order).
recipe('r-linsen', 'Linsen mit Spätzle', ['Linsen', 'Spätzle', 'Zwiebel', 'Karotte'])
recipe('r-curry', 'Curry', ['Kokosmilch', 'Zwiebel', 'Reis', 'Salz'])
recipe('r-toast', 'Toast', ['Brot'])
recipe('r-pasta', 'Pasta', ['Nudeln', 'Tomaten', 'Basilikum'])
plan('m-linsen', day(3), 'r-linsen')
plan('m-curry', day(1), 'r-curry')
plan('m-toast', day(2), 'r-toast')
plan('m-pasta', day(4), 'r-pasta')
// Shopped for Linsen before this feature existed: the row still names the meal.
row('s-linsen', 'Linsen', ['m-linsen'], ['Linsen mit Spätzle'], true)

describe('shopping_meal_added', () => {
  it('backfills once from meals referenced by shopping rows', () => {
    expect(Array.from(meals.getAddedMealIds())).toEqual(['m-linsen'])
    expect(db.getSetting('shopping_meal_added_backfill_v1')).toBe('1')
  })

  it('keeps a meal added after its bought rows were cleared', async () => {
    db.clearCheckedItems()
    expect(db.getAllShoppingItems()).toHaveLength(0)
    expect(meals.getAddedMealIds().has('m-linsen')).toBe(true)
    const { byMeal } = await preview()
    expect(byMeal.get('m-linsen')?.added).toBe(true)
  })

  it('marks and unmarks meals; unknown ids are ignored', () => {
    meals.markMealsAdded(['m-pasta', 'does-not-exist'])
    expect(meals.getAddedMealIds(['m-pasta', 'does-not-exist', 'm-curry'])).toEqual(new Set(['m-pasta']))
    meals.unmarkMeals(['m-pasta'])
    expect(meals.getAddedMealIds().has('m-pasta')).toBe(false)
  })

  it('unmarking drops the meal from shopping rows but keeps their recipe names', async () => {
    row('s-nudeln', 'Nudeln', ['m-pasta', 'm-curry'], ['Pasta', 'Curry'])
    expect((await preview()).byMeal.get('m-pasta')?.added).toBe(true) // referenced by a row
    meals.unmarkMeals(['m-pasta'])
    const item = db.getShoppingItemById('s-nudeln')!
    expect(item.meal_plan_ids).toEqual(['m-curry'])
    expect(item.recipe_names).toEqual(['Pasta', 'Curry'])
    expect((await preview()).byMeal.get('m-pasta')?.added).toBe(false)
    db.deleteShoppingItem('s-nudeln')
  })

  it('a mark no longer applies once the dish of that evening is swapped', () => {
    meals.markMealsAdded(['m-toast'])
    expect(meals.getAddedMealIds().has('m-toast')).toBe(true)
    db.updateMealPlanEntry('m-toast', { recipe_id: 'r-pasta' })
    expect(meals.getAddedMealIds().has('m-toast')).toBe(false)
    db.updateMealPlanEntry('m-toast', { recipe_id: 'r-toast' })
    meals.unmarkMeals(['m-toast'])
  })
})

describe('preview meals', () => {
  it('lists every planned recipe meal sorted by date with flags and counts', async () => {
    const { data, byMeal, byName } = await preview()
    expect((data.meals as Meal[]).map(m => m.meal_plan_id)).toEqual(['m-curry', 'm-toast', 'm-linsen', 'm-pasta'])
    expect(byMeal.get('m-curry')).toMatchObject({ name: 'Curry', added: false, item_count: 3, thin: false, date: day(1) })
    expect(byMeal.get('m-toast')).toMatchObject({ added: false, item_count: 1, thin: true })
    expect(byMeal.get('m-linsen')).toMatchObject({ added: true, item_count: 4 })
    expect(data.skipped_meals).toBe(1)
    // Items of added meals still come back (flagged); shared ones are not flagged.
    expect(byName.get('Linsen')).toMatchObject({ added: true, meal_plan_ids: ['m-linsen'] })
    expect(byName.get('Zwiebel')?.added).toBe(false)
    expect(byName.get('Zwiebel')?.meal_plan_ids.sort()).toEqual(['m-curry', 'm-linsen'])
    expect(byName.has('Salz')).toBe(false)
    // "kaum Zutaten" hints only for open meals
    expect(data.hints).toEqual([{ recipe_name: 'Toast', count: 1 }])
  })

  it('add_selected marks the meals of the added lines; they stay added after clearing', async () => {
    const { data } = await post({
      action: 'add_selected',
      items: [{ name: 'Kokosmilch', category: 'pantry', recipe_names: ['Curry'], meal_plan_ids: ['m-curry'] }],
    })
    expect(data.ok).toBe(true)
    expect(meals.getAddedMealIds().has('m-curry')).toBe(true)
    for (const item of db.getAllShoppingItems()) db.toggleShoppingItem(item.id)
    expect((await post({ action: 'clear_checked' })).data.ok).toBe(true)
    const { byMeal } = await preview()
    expect(byMeal.get('m-curry')?.added).toBe(true)
    expect(byMeal.get('m-toast')?.added).toBe(false)
  })

  it('mark_meals records and reverses „schon eingekauft“', async () => {
    expect((await post({ action: 'mark_meals', meal_plan_ids: ['m-toast'], added: true })).data.ok).toBe(true)
    expect((await preview()).byMeal.get('m-toast')?.added).toBe(true)
    expect((await post({ action: 'mark_meals', meal_plan_ids: ['m-toast'], added: false })).data.ok).toBe(true)
    expect((await preview()).byMeal.get('m-toast')?.added).toBe(false)
    expect((await post({ action: 'mark_meals', meal_plan_ids: [], added: true })).status).toBe(400)
    expect((await post({ action: 'mark_meals', meal_plan_ids: ['m-toast'] })).status).toBe(400)
  })

  it('generate skips meals already shopped for and marks the ones it adds', async () => {
    db.clearAllItems()
    const { data } = await post({ action: 'generate', start: day(0), end: END })
    expect(data.ok).toBe(true)
    const names = db.getAllShoppingItems().map(i => i.name).sort()
    // Curry and Linsen were shopped for; Toast and Pasta were not.
    expect(names).toEqual(['Basilikum', 'Brot', 'Nudeln', 'Tomaten'])
    expect(meals.getAddedMealIds()).toEqual(new Set(['m-linsen', 'm-curry', 'm-toast', 'm-pasta']))
    expect((await post({ action: 'generate', start: day(0), end: END })).data.added).toBe(0)
  })

  it('a moved meal keeps its added flag', async () => {
    db.getDb().prepare('UPDATE meal_plan SET date = ? WHERE id = ?').run(day(5), 'm-pasta')
    const { byMeal } = await preview()
    expect(byMeal.get('m-pasta')).toMatchObject({ date: day(5), added: true })
  })
})
