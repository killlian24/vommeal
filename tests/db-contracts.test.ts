import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'

// Build a legacy-schema database BEFORE lib/db is imported, so migrate()
// runs against it exactly like on an existing installation.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vommeal-contracts-'))
process.env.DATA_DIR = tmpDir

const legacy = new Database(path.join(tmpDir, 'vommeal.db'))
legacy.exec(`
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE recipes (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', tags TEXT DEFAULT '[]',
    servings INTEGER DEFAULT 4, prep_time INTEGER DEFAULT 0, cook_time INTEGER DEFAULT 0,
    ingredients TEXT DEFAULT '[]', instructions TEXT DEFAULT '[]', image_url TEXT DEFAULT '',
    mealie_id TEXT UNIQUE, mealie_slug TEXT, source TEXT DEFAULT 'local',
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE meal_plan (
    id TEXT PRIMARY KEY, date TEXT NOT NULL, meal_type TEXT NOT NULL DEFAULT 'dinner',
    recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL, custom_meal_name TEXT,
    servings INTEGER DEFAULT 2, notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'suggested', suggested_by TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE shopping_list (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, amount TEXT DEFAULT '', unit TEXT DEFAULT '',
    category TEXT DEFAULT 'other', checked INTEGER DEFAULT 0, source TEXT DEFAULT 'manual',
    meal_plan_id TEXT, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
  );
  INSERT INTO recipes (id, name, image_url, mealie_id, mealie_slug, source)
    VALUES ('r1', 'Lasagne', 'http://mealie.lan:9000/api/media/recipes/abc/images/original.webp', 'abc', 'lasagne', 'mealie');
  INSERT INTO recipes (id, name) VALUES ('r2', 'Brot');
  INSERT INTO meal_plan (id, date, recipe_id, status) VALUES ('m1', '2026-09-21', 'r1', 'suggested');
  INSERT INTO meal_plan (id, date, custom_meal_name, status) VALUES ('m2', '2026-09-22', 'Reste', 'approved');
  INSERT INTO shopping_list (id, name, source, meal_plan_id) VALUES ('s1', 'Nudeln', 'meal_plan', 'm1');
  INSERT INTO shopping_list (id, name, source) VALUES ('s2', 'Milch', 'manual');
`)
legacy.close()

const db = await import('../lib/db')

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('approval migration', () => {
  it('turns suggested entries into approved ones once', () => {
    const entries = db.getMealPlanRange('2026-09-21', '2026-09-22')
    expect(entries.map(e => e.status)).toEqual(['approved', 'approved'])
    const raw = db.getDb().prepare("SELECT COUNT(*) AS n FROM meal_plan WHERE status = 'suggested'").get() as { n: number }
    expect(raw.n).toBe(0)
    expect(db.getSetting('migration_approve_all_v1')).toBe('1')
  })

  it('stores new entries as approved even when suggested is passed', () => {
    const e = db.addMealPlanEntry({
      id: 'm3', date: '2026-09-23', meal_type: 'dinner', recipe_id: 'r2', custom_meal_name: null,
      servings: 2, notes: '', status: 'suggested', suggested_by: 'Susi',
    })
    expect(e.status).toBe('approved')
    db.updateMealPlanEntry('m3', { status: 'suggested' })
    const raw = db.getDb().prepare('SELECT status FROM meal_plan WHERE id = ?').get('m3') as { status: string }
    expect(raw.status).toBe('approved')
  })
})

describe('recipe image_url contract', () => {
  it('returns the proxy URL for stored images and empty otherwise', () => {
    expect(db.getRecipeById('r1')!.image_url).toBe('/api/images/r1')
    expect(db.getRecipeById('r2')!.image_url).toBe('')
    expect(db.getAllRecipes().find(r => r.id === 'r1')!.image_url).toBe('/api/images/r1')
    expect(db.getMealPlanRange('2026-09-21', '2026-09-21')[0].recipe!.image_url).toBe('/api/images/r1')
  })

  it('keeps the stored upstream URL when the proxy URL is written back', () => {
    const r = db.getRecipeById('r1')!
    db.upsertRecipe({ ...r, name: 'Lasagne al forno' })
    expect(db.getRecipeImageSource('r1')).toBe('http://mealie.lan:9000/api/media/recipes/abc/images/original.webp')
    db.upsertRecipe({ ...db.getRecipeById('r2')!, image_url: 'https://example.com/brot.jpg' })
    expect(db.getRecipeImageSource('r2')).toBe('https://example.com/brot.jpg')
    expect(db.getRecipeById('r2')!.image_url).toBe('/api/images/r2')
  })

  it('maps nomination recipes too', () => {
    db.addNomination({ id: 'n1', date: '2026-09-24', recipe_id: 'r1', user_name: 'Kilian' })
    expect(db.getNominationsForRange('2026-09-24', '2026-09-24')[0].recipe!.image_url).toBe('/api/images/r1')
  })
})

describe('recipe effort', () => {
  it('is preserved by upserts that do not mention it (Mealie sync)', () => {
    db.updateRecipeEffort('r1', 'quick')
    expect(db.getRecipeById('r1')!.effort).toBe('quick')
    // What the sync does: no effort key at all.
    db.upsertRecipe({ id: 'r1', name: 'Lasagne', mealie_id: 'abc', mealie_slug: 'lasagne', source: 'mealie', rating: 4 })
    expect(db.getRecipeById('r1')!.effort).toBe('quick')
    expect(db.getMealPlanRange('2026-09-21', '2026-09-21')[0].recipe!.effort).toBe('quick')
  })

  it('can be set and cleared explicitly', () => {
    db.upsertRecipe({ ...db.getRecipeById('r1')!, effort: 'involved' })
    expect(db.getRecipeById('r1')!.effort).toBe('involved')
    db.updateRecipeEffort('r1', null)
    expect(db.getRecipeById('r1')!.effort).toBeNull()
  })
})

describe('shopping sources', () => {
  it('backfills meal_plan_ids and recipe_names from the legacy column', () => {
    const s1 = db.getShoppingItemById('s1')!
    expect(s1.meal_plan_ids).toEqual(['m1'])
    expect(s1.recipe_names).toEqual(['Lasagne'])
    const s2 = db.getShoppingItemById('s2')!
    expect(s2.meal_plan_ids).toEqual([])
    expect(s2.recipe_names).toEqual([])
  })

  it('accepts the arrays on insert', () => {
    const base = {
      amount: '', unit: '', category: 'other', checked: false, source: 'meal_plan' as const,
      ha_uid: null, sort_order: 0,
    }
    db.addShoppingItem({ ...base, id: 's3', name: 'Tomaten', meal_plan_id: 'm1', recipe_names: ['Lasagne', 'Brot'], meal_plan_ids: ['m1', 'm3'] })
    expect(db.getShoppingItemById('s3')).toMatchObject({ recipe_names: ['Lasagne', 'Brot'], meal_plan_ids: ['m1', 'm3'] })
    db.addShoppingItem({ ...base, id: 's4', name: 'Salz', meal_plan_id: 'm1' })
    expect(db.getShoppingItemById('s4')).toMatchObject({ recipe_names: [], meal_plan_ids: ['m1'] })
  })
})

describe('usage events', () => {
  it('aggregates by name, user and day and prunes old rows', () => {
    const now = new Date('2026-09-24T12:00:00Z')
    db.getDb().prepare("INSERT INTO events (name, user_name, props, created_at) VALUES ('old', 'x', '{}', '2025-01-01 00:00:00')").run()
    db.addEvent('open', 'Susi', '{}', now)
    db.addEvent('open', 'Kilian', '{}', now)
    db.addEvent('plan', 'Susi', '{"n":1}', new Date('2026-09-23T08:00:00Z'))
    const stats = db.getEventStats(30, now)
    expect(stats.total).toBe(3)
    expect(stats.byName).toEqual({ open: 2, plan: 1 })
    expect(stats.byUser).toEqual({ Susi: 2, Kilian: 1 })
    expect(stats.byDay).toEqual({ '2026-09-23': 1, '2026-09-24': 2 })
    const old = db.getDb().prepare("SELECT COUNT(*) AS n FROM events WHERE name = 'old'").get() as { n: number }
    expect(old.n).toBe(0)
  })
})
