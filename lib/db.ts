import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  _db = new Database(path.join(DATA_DIR, 'vommeal.db'))
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  migrate(_db)
  return _db
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      description  TEXT DEFAULT '',
      tags         TEXT DEFAULT '[]',
      servings     INTEGER DEFAULT 4,
      prep_time    INTEGER DEFAULT 0,
      cook_time    INTEGER DEFAULT 0,
      ingredients  TEXT DEFAULT '[]',
      instructions TEXT DEFAULT '[]',
      image_url    TEXT DEFAULT '',
      mealie_id    TEXT UNIQUE,
      mealie_slug  TEXT,
      source       TEXT DEFAULT 'local',
      created_at   TEXT DEFAULT (datetime('now')),
      updated_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meal_plan (
      id               TEXT PRIMARY KEY,
      date             TEXT NOT NULL,
      meal_type        TEXT NOT NULL DEFAULT 'dinner',
      recipe_id        TEXT REFERENCES recipes(id) ON DELETE SET NULL,
      custom_meal_name TEXT,
      servings         INTEGER DEFAULT 2,
      notes            TEXT DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'suggested',
      suggested_by     TEXT NOT NULL DEFAULT '',
      created_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_meal_plan_date ON meal_plan(date);

    CREATE TABLE IF NOT EXISTS nominations (
      id         TEXT PRIMARY KEY,
      date       TEXT NOT NULL,
      recipe_id  TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      user_name  TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(date, recipe_id, user_name)
    );

    CREATE INDEX IF NOT EXISTS idx_nominations_date ON nominations(date);

    CREATE TABLE IF NOT EXISTS shopping_list (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      amount       TEXT DEFAULT '',
      unit         TEXT DEFAULT '',
      category     TEXT DEFAULT 'other',
      checked      INTEGER DEFAULT 0,
      source       TEXT DEFAULT 'manual',
      meal_plan_id TEXT,
      sort_order   INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pantry_staples (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)

  // Non-destructive migrations for existing DBs
  for (const col of ['status TEXT NOT NULL DEFAULT \'suggested\'', 'suggested_by TEXT NOT NULL DEFAULT \'\'']) {
    try { db.exec(`ALTER TABLE meal_plan ADD COLUMN ${col}`) } catch { /* already exists */ }
  }
  try { db.exec('ALTER TABLE recipes ADD COLUMN rating INTEGER') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE shopping_list ADD COLUMN ha_uid TEXT') } catch { /* already exists */ }
}

// --- Settings ---
export function getSetting(key: string): string | null {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

// --- Recipes ---
export type Recipe = {
  id: string
  name: string
  description: string
  tags: string[]
  servings: number
  prep_time: number
  cook_time: number
  ingredients: Ingredient[]
  instructions: Instruction[]
  image_url: string
  mealie_id: string | null
  mealie_slug: string | null
  source: 'local' | 'mealie'
  rating: number | null
  created_at: string
  updated_at: string
}

export type Ingredient = { amount: string; unit: string; name: string; note?: string }
export type Instruction = { text: string }

function parseRecipe(row: Record<string, unknown>): Recipe {
  return {
    ...(row as unknown as Recipe),
    tags: JSON.parse(row.tags as string || '[]'),
    ingredients: JSON.parse(row.ingredients as string || '[]'),
    instructions: JSON.parse(row.instructions as string || '[]'),
  }
}

export function getAllRecipes(): Recipe[] {
  const rows = getDb().prepare('SELECT * FROM recipes ORDER BY name ASC').all() as Record<string, unknown>[]
  return rows.map(parseRecipe)
}

export function getRecipeById(id: string): Recipe | null {
  const row = getDb().prepare('SELECT * FROM recipes WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? parseRecipe(row) : null
}

export function upsertRecipe(recipe: Partial<Recipe> & { id: string; name: string }): Recipe {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM recipes WHERE id = ?').get(recipe.id)
  if (existing) {
    db.prepare(`
      UPDATE recipes SET
        name = ?, description = ?, tags = ?, servings = ?, prep_time = ?,
        cook_time = ?, ingredients = ?, instructions = ?, image_url = ?,
        mealie_id = ?, mealie_slug = ?, source = ?, rating = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      recipe.name, recipe.description ?? '', JSON.stringify(recipe.tags ?? []),
      recipe.servings ?? 4, recipe.prep_time ?? 0, recipe.cook_time ?? 0,
      JSON.stringify(recipe.ingredients ?? []), JSON.stringify(recipe.instructions ?? []),
      recipe.image_url ?? '', recipe.mealie_id ?? null, recipe.mealie_slug ?? null,
      recipe.source ?? 'local', recipe.rating ?? null, recipe.id
    )
  } else {
    db.prepare(`
      INSERT INTO recipes (id, name, description, tags, servings, prep_time, cook_time,
        ingredients, instructions, image_url, mealie_id, mealie_slug, source, rating)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      recipe.id, recipe.name, recipe.description ?? '', JSON.stringify(recipe.tags ?? []),
      recipe.servings ?? 4, recipe.prep_time ?? 0, recipe.cook_time ?? 0,
      JSON.stringify(recipe.ingredients ?? []), JSON.stringify(recipe.instructions ?? []),
      recipe.image_url ?? '', recipe.mealie_id ?? null, recipe.mealie_slug ?? null,
      recipe.source ?? 'local', recipe.rating ?? null
    )
  }
  return getRecipeById(recipe.id)!
}

export function updateRecipeRating(id: string, rating: number | null) {
  getDb().prepare("UPDATE recipes SET rating = ?, updated_at = datetime('now') WHERE id = ?").run(rating, id)
}

export function deleteRecipe(id: string) {
  getDb().prepare('DELETE FROM recipes WHERE id = ?').run(id)
}

// --- Meal Plan ---
export type MealPlanEntry = {
  id: string
  date: string
  meal_type: 'dinner'
  recipe_id: string | null
  custom_meal_name: string | null
  servings: number
  notes: string
  status: 'suggested' | 'approved'
  suggested_by: string
  created_at: string
  recipe?: Recipe
}

export function getMealPlanRange(startDate: string, endDate: string): MealPlanEntry[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT mp.*, r.name as recipe_name, r.image_url as recipe_image,
           r.tags as recipe_tags, r.prep_time, r.cook_time, r.servings as recipe_servings,
           r.mealie_id, r.mealie_slug, r.source as recipe_source, r.rating as recipe_rating
    FROM meal_plan mp
    LEFT JOIN recipes r ON mp.recipe_id = r.id
    WHERE mp.date BETWEEN ? AND ? AND mp.meal_type = 'dinner'
    ORDER BY mp.date ASC
  `).all(startDate, endDate) as Record<string, unknown>[]

  return rows.map(row => ({
    id: row.id as string,
    date: row.date as string,
    meal_type: 'dinner' as const,
    recipe_id: row.recipe_id as string | null,
    custom_meal_name: row.custom_meal_name as string | null,
    servings: row.servings as number,
    notes: row.notes as string,
    status: (row.status as string || 'approved') as 'suggested' | 'approved',
    suggested_by: row.suggested_by as string || '',
    created_at: row.created_at as string,
    recipe: row.recipe_id ? {
      id: row.recipe_id as string,
      name: row.recipe_name as string,
      image_url: row.recipe_image as string,
      tags: JSON.parse(row.recipe_tags as string || '[]'),
      prep_time: row.prep_time as number,
      cook_time: row.cook_time as number,
      servings: row.recipe_servings as number,
      mealie_id: row.mealie_id as string | null,
      mealie_slug: row.mealie_slug as string | null,
      source: row.recipe_source as 'local' | 'mealie',
      rating: row.recipe_rating as number | null,
    } as Recipe : undefined,
  }))
}

export function addMealPlanEntry(entry: Omit<MealPlanEntry, 'created_at' | 'recipe'>): MealPlanEntry {
  const db = getDb()
  // Enforce one entry per date+meal_type — remove any existing before inserting
  db.prepare('DELETE FROM meal_plan WHERE date = ? AND meal_type = ?').run(entry.date, 'dinner')
  db.prepare(`
    INSERT INTO meal_plan (id, date, meal_type, recipe_id, custom_meal_name, servings, notes, status, suggested_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id, entry.date, 'dinner',
    entry.recipe_id ?? null, entry.custom_meal_name ?? null,
    entry.servings, entry.notes ?? '',
    entry.status ?? 'suggested', entry.suggested_by ?? ''
  )
  return { ...entry, created_at: new Date().toISOString() }
}

export function updateMealPlanEntry(id: string, data: Partial<MealPlanEntry>) {
  const db = getDb()
  if (data.status !== undefined) {
    db.prepare('UPDATE meal_plan SET status = ? WHERE id = ?').run(data.status, id)
  }
  if (data.recipe_id !== undefined || data.custom_meal_name !== undefined || data.servings !== undefined || data.notes !== undefined) {
    db.prepare(`
      UPDATE meal_plan SET
        recipe_id = COALESCE(?, recipe_id),
        custom_meal_name = COALESCE(?, custom_meal_name),
        servings = COALESCE(?, servings),
        notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(data.recipe_id ?? null, data.custom_meal_name ?? null, data.servings ?? null, data.notes ?? null, id)
  }
}

export function deleteMealPlanEntry(id: string) {
  getDb().prepare('DELETE FROM meal_plan WHERE id = ?').run(id)
}

// --- Nominations (Fun mode) ---
export type Nomination = {
  id: string
  date: string
  recipe_id: string
  user_name: string
  created_at: string
  recipe?: Recipe
}

export function getNominationsForRange(startDate: string, endDate: string): Nomination[] {
  const rows = getDb().prepare(`
    SELECT n.*, r.name as recipe_name, r.image_url as recipe_image,
           r.tags as recipe_tags, r.prep_time, r.cook_time, r.servings as recipe_servings,
           r.mealie_id, r.mealie_slug, r.source as recipe_source, r.rating as recipe_rating
    FROM nominations n
    JOIN recipes r ON n.recipe_id = r.id
    WHERE n.date BETWEEN ? AND ?
    ORDER BY n.date ASC, n.created_at ASC
  `).all(startDate, endDate) as Record<string, unknown>[]

  return rows.map(row => ({
    id: row.id as string,
    date: row.date as string,
    recipe_id: row.recipe_id as string,
    user_name: row.user_name as string,
    created_at: row.created_at as string,
    recipe: {
      id: row.recipe_id as string,
      name: row.recipe_name as string,
      image_url: row.recipe_image as string,
      tags: JSON.parse(row.recipe_tags as string || '[]'),
      prep_time: row.prep_time as number,
      cook_time: row.cook_time as number,
      servings: row.recipe_servings as number,
      mealie_id: row.mealie_id as string | null,
      mealie_slug: row.mealie_slug as string | null,
      source: row.recipe_source as 'local' | 'mealie',
      rating: row.recipe_rating as number | null,
    } as Recipe,
  }))
}

export function addNomination(nom: Omit<Nomination, 'created_at' | 'recipe'>): Nomination | null {
  try {
    getDb().prepare(
      'INSERT OR IGNORE INTO nominations (id, date, recipe_id, user_name) VALUES (?, ?, ?, ?)'
    ).run(nom.id, nom.date, nom.recipe_id, nom.user_name)
    return { ...nom, created_at: new Date().toISOString() }
  } catch {
    return null
  }
}

export function deleteNomination(id: string) {
  getDb().prepare('DELETE FROM nominations WHERE id = ?').run(id)
}

export function deleteNominationsForDate(date: string) {
  getDb().prepare('DELETE FROM nominations WHERE date = ?').run(date)
}

export function deleteNominationsOlderThan(cutoffDate: string) {
  getDb().prepare('DELETE FROM nominations WHERE date < ?').run(cutoffDate)
}

// --- Shopping List ---
export type ShoppingItem = {
  id: string
  name: string
  amount: string
  unit: string
  category: string
  checked: boolean
  source: 'manual' | 'meal_plan' | 'ha'
  meal_plan_id: string | null
  ha_uid: string | null
  sort_order: number
  created_at: string
}

const CATEGORIES = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other']

export function getAllShoppingItems(): ShoppingItem[] {
  const rows = getDb().prepare('SELECT * FROM shopping_list ORDER BY category ASC, sort_order ASC, name ASC').all() as Record<string, unknown>[]
  return rows.map(row => ({ ...row, checked: !!row.checked, ha_uid: row.ha_uid ?? null } as ShoppingItem))
}

export function getShoppingItemById(id: string): ShoppingItem | null {
  const row = getDb().prepare('SELECT * FROM shopping_list WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? { ...row, checked: !!row.checked, ha_uid: row.ha_uid ?? null } as ShoppingItem : null
}

export function haUidExists(haUid: string): boolean {
  const row = getDb().prepare('SELECT id FROM shopping_list WHERE ha_uid = ? AND checked = 0').get(haUid)
  return !!row
}

// Find an unchecked item by name (case-insensitive) that has no ha_uid yet
export function findUntrackedItemByName(name: string): ShoppingItem | null {
  const row = getDb().prepare(
    'SELECT * FROM shopping_list WHERE LOWER(name) = LOWER(?) AND checked = 0 AND ha_uid IS NULL LIMIT 1'
  ).get(name.trim()) as Record<string, unknown> | undefined
  return row ? { ...row, checked: !!row.checked, ha_uid: null } as ShoppingItem : null
}

export function addShoppingItem(item: Omit<ShoppingItem, 'created_at'>): ShoppingItem {
  getDb().prepare(`
    INSERT INTO shopping_list (id, name, amount, unit, category, checked, source, meal_plan_id, ha_uid, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(item.id, item.name, item.amount, item.unit, item.category, item.checked ? 1 : 0, item.source, item.meal_plan_id ?? null, item.ha_uid ?? null, item.sort_order)
  return { ...item, created_at: new Date().toISOString() }
}

export function toggleShoppingItem(id: string) {
  getDb().prepare('UPDATE shopping_list SET checked = NOT checked WHERE id = ?').run(id)
}

export function checkShoppingItem(id: string) {
  getDb().prepare('UPDATE shopping_list SET checked = 1 WHERE id = ?').run(id)
}

export function setShoppingItemHaUid(id: string, haUid: string) {
  getDb().prepare('UPDATE shopping_list SET ha_uid = ? WHERE id = ?').run(haUid, id)
}

export function deleteShoppingItem(id: string) {
  getDb().prepare('DELETE FROM shopping_list WHERE id = ?').run(id)
}

export function clearCheckedItems() {
  getDb().prepare('DELETE FROM shopping_list WHERE checked = 1').run()
}

export function clearAllItems() {
  getDb().prepare('DELETE FROM shopping_list').run()
}

export { CATEGORIES }

// --- Pantry Staples ---
export type PantryStaple = { id: string; name: string; created_at: string }

export function getAllPantryStaples(): PantryStaple[] {
  return getDb().prepare('SELECT * FROM pantry_staples ORDER BY name ASC').all() as PantryStaple[]
}

export function addPantryStaple(id: string, name: string): PantryStaple {
  const trimmed = name.trim()
  getDb().prepare('INSERT OR IGNORE INTO pantry_staples (id, name) VALUES (?, ?)').run(id, trimmed)
  return getDb().prepare('SELECT * FROM pantry_staples WHERE LOWER(name) = LOWER(?)').get(trimmed) as PantryStaple
}

export function deletePantryStaple(id: string) {
  getDb().prepare('DELETE FROM pantry_staples WHERE id = ?').run(id)
}
