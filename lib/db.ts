import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { normalizeIngredient, normalizeInstructions } from './ingredients'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

export function getDbPath(): string {
  return path.join(DATA_DIR, 'vommeal.db')
}

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  _db = new Database(getDbPath())
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
      status           TEXT NOT NULL DEFAULT 'approved',
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
      ha_uid       TEXT,
      ha_summary   TEXT,
      normalized_name TEXT,
      last_seen_in_ha_at TEXT,
      last_synced_to_ha_at TEXT,
      sync_status TEXT DEFAULT 'ok',
      updated_at   TEXT DEFAULT (datetime('now')),
      created_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL,
      status      TEXT NOT NULL,
      started_at  TEXT DEFAULT (datetime('now')),
      finished_at TEXT,
      summary     TEXT DEFAULT '{}',
      error       TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS pantry_staples (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      user_name  TEXT NOT NULL DEFAULT '',
      props      TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
  `)

  // Non-destructive migrations for existing DBs
  for (const col of ['status TEXT NOT NULL DEFAULT \'approved\'', 'suggested_by TEXT NOT NULL DEFAULT \'\'']) {
    try { db.exec(`ALTER TABLE meal_plan ADD COLUMN ${col}`) } catch { /* already exists */ }
  }
  try { db.exec('ALTER TABLE recipes ADD COLUMN rating INTEGER') } catch { /* already exists */ }
  // Local-only effort flag ('quick' | 'involved' | NULL); never touched by Mealie sync.
  try { db.exec('ALTER TABLE recipes ADD COLUMN effort TEXT') } catch { /* already exists */ }
  try { db.exec("ALTER TABLE shopping_list ADD COLUMN recipe_names TEXT DEFAULT '[]'") } catch { /* already exists */ }
  try { db.exec("ALTER TABLE shopping_list ADD COLUMN meal_plan_ids TEXT DEFAULT '[]'") } catch { /* already exists */ }
  try { db.exec('ALTER TABLE shopping_list ADD COLUMN ha_uid TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE shopping_list ADD COLUMN ha_summary TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE shopping_list ADD COLUMN normalized_name TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE shopping_list ADD COLUMN last_seen_in_ha_at TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE shopping_list ADD COLUMN last_synced_to_ha_at TEXT') } catch { /* already exists */ }
  try { db.exec("ALTER TABLE shopping_list ADD COLUMN sync_status TEXT DEFAULT 'ok'") } catch { /* already exists */ }
  try { db.exec('ALTER TABLE shopping_list ADD COLUMN updated_at TEXT') } catch { /* already exists */ }
  try {
    db.exec("UPDATE shopping_list SET updated_at = COALESCE(updated_at, created_at, datetime('now'))")
  } catch { /* best-effort backfill */ }
  try {
    db.exec("UPDATE shopping_list SET normalized_name = LOWER(TRIM(name)) WHERE normalized_name IS NULL OR normalized_name = ''")
  } catch { /* best-effort backfill */ }
  try {
    db.exec("UPDATE shopping_list SET sync_status = COALESCE(sync_status, 'ok')")
  } catch { /* best-effort backfill */ }

  // One-time data migration: recipes synced before ingredient parsing existed
  // may hold unparsed lines (amount "0", note == name) and merged instruction
  // lists. Guarded by a settings flag so it only ever runs once.
  runOnce(db, 'migration_ingredients_v1', () => { normalizeStoredRecipes(db) })

  // One-time: the suggest/approve flow is gone, every plan entry is approved.
  runOnce(db, 'migration_approve_all_v1', () => {
    db.prepare("UPDATE meal_plan SET status = 'approved' WHERE status <> 'approved'").run()
  })

  // One-time: shopping items remember every meal/recipe they came from
  // (JSON arrays). Backfill from the single legacy meal_plan_id column.
  runOnce(db, 'migration_shopping_sources_v1', () => {
    db.exec(`
      UPDATE shopping_list
      SET meal_plan_ids = json_array(meal_plan_id)
      WHERE meal_plan_id IS NOT NULL AND meal_plan_id <> ''
        AND (meal_plan_ids IS NULL OR meal_plan_ids = '' OR meal_plan_ids = '[]');

      UPDATE shopping_list
      SET recipe_names = (
        SELECT json_array(r.name) FROM meal_plan mp JOIN recipes r ON r.id = mp.recipe_id
        WHERE mp.id = shopping_list.meal_plan_id
      )
      WHERE meal_plan_id IS NOT NULL
        AND (recipe_names IS NULL OR recipe_names = '' OR recipe_names = '[]')
        AND EXISTS (
          SELECT 1 FROM meal_plan mp JOIN recipes r ON r.id = mp.recipe_id
          WHERE mp.id = shopping_list.meal_plan_id
        );

      UPDATE shopping_list SET meal_plan_ids = '[]' WHERE meal_plan_ids IS NULL OR meal_plan_ids = '';
      UPDATE shopping_list SET recipe_names = '[]' WHERE recipe_names IS NULL OR recipe_names = '';
    `)
  })
}

/** Run `fn` once per database, guarded by a settings flag. */
function runOnce(db: Database.Database, flagKey: string, fn: () => void) {
  const flag = db.prepare('SELECT value FROM settings WHERE key = ?').get(flagKey) as { value: string } | undefined
  if (flag?.value === '1') return
  db.transaction(() => {
    fn()
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(flagKey, '1')
  })()
}

function needsIngredientNormalization(ings: Ingredient[]): boolean {
  return ings.some(i => {
    const amount = i.amount == null ? '' : String(i.amount).trim()
    if (amount === '0' || (amount !== '' && Number(amount) === 0)) return true
    if (i.note && i.name && i.note.trim().toLowerCase() === i.name.trim().toLowerCase()) return true
    return false
  })
}

/**
 * Normalize ingredients/instructions of already-stored recipes in place.
 * Only rows that show the unparsed pattern are rewritten. Returns the number
 * of updated recipes. Exported for tests; migrate() calls it once.
 */
export function normalizeStoredRecipes(db: Database.Database): number {
  const rows = db.prepare('SELECT id, ingredients, instructions FROM recipes').all() as
    { id: string; ingredients: string; instructions: string }[]
  const update = db.prepare("UPDATE recipes SET ingredients = ?, instructions = ?, updated_at = datetime('now') WHERE id = ?")
  let updated = 0

  db.transaction(() => {
    for (const row of rows) {
      let ingredients: Ingredient[]
      let instructions: Instruction[]
      try {
        ingredients = JSON.parse(row.ingredients || '[]')
        instructions = JSON.parse(row.instructions || '[]')
      } catch {
        continue
      }
      if (!Array.isArray(ingredients) || !Array.isArray(instructions)) continue

      let changed = false
      if (needsIngredientNormalization(ingredients)) {
        ingredients = ingredients.map(i => normalizeIngredient(i))
        changed = true
      }
      const splitInstructions = normalizeInstructions(instructions)
      if (splitInstructions !== instructions) {
        instructions = splitInstructions
        changed = true
      }
      if (changed) {
        update.run(JSON.stringify(ingredients), JSON.stringify(instructions), row.id)
        updated++
      }
    }
  })()

  return updated
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
export type RecipeEffort = 'quick' | 'involved'
export const RECIPE_EFFORTS: readonly RecipeEffort[] = ['quick', 'involved']

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
  /** Public URL: `/api/images/<id>` when an image is stored, '' otherwise. */
  image_url: string
  mealie_id: string | null
  mealie_slug: string | null
  source: 'local' | 'mealie'
  rating: number | null
  effort: RecipeEffort | null
  created_at: string
  updated_at: string
}

export type Ingredient = { amount: string; unit: string; name: string; note?: string }
export type Instruction = { text: string }

/**
 * Recipes store the original (usually Mealie) image URL. Clients only ever
 * see the same-origin proxy, which also works over Tailscale away from home.
 */
export function publicImageUrl(recipeId: string, storedUrl: unknown): string {
  return typeof storedUrl === 'string' && storedUrl.trim() ? `/api/images/${recipeId}` : ''
}

function isProxyImageUrl(url: string | undefined): boolean {
  return !!url && /^\/api\/images\//.test(url)
}

function parseEffort(value: unknown): RecipeEffort | null {
  return value === 'quick' || value === 'involved' ? value : null
}

function parseRecipe(row: Record<string, unknown>): Recipe {
  return {
    ...(row as unknown as Recipe),
    tags: JSON.parse(row.tags as string || '[]'),
    ingredients: JSON.parse(row.ingredients as string || '[]'),
    instructions: JSON.parse(row.instructions as string || '[]'),
    image_url: publicImageUrl(row.id as string, row.image_url),
    effort: parseEffort(row.effort),
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

/** The stored (upstream) image URL of a recipe, as synced from Mealie or entered by hand. */
export function getRecipeImageSource(id: string): string | null {
  const row = getDb().prepare('SELECT image_url FROM recipes WHERE id = ?').get(id) as { image_url: string | null } | undefined
  if (!row) return null
  return row.image_url?.trim() || null
}

/**
 * Insert or update a recipe.
 * - `effort` is local-only: it is only written when the caller passes the
 *   key explicitly, so Mealie syncs never reset it.
 * - An `image_url` that is the public proxy URL (`/api/images/…`, i.e. what
 *   the API handed out) or undefined keeps the stored upstream URL.
 */
export function upsertRecipe(recipe: Partial<Recipe> & { id: string; name: string }): Recipe {
  const db = getDb()
  const existing = db.prepare('SELECT id, image_url, effort FROM recipes WHERE id = ?').get(recipe.id) as
    { id: string; image_url: string | null; effort: string | null } | undefined
  const effort = recipe.effort !== undefined ? parseEffort(recipe.effort) : parseEffort(existing?.effort)
  const imageUrl = recipe.image_url === undefined || isProxyImageUrl(recipe.image_url)
    ? (existing?.image_url ?? '')
    : recipe.image_url
  if (existing) {
    db.prepare(`
      UPDATE recipes SET
        name = ?, description = ?, tags = ?, servings = ?, prep_time = ?,
        cook_time = ?, ingredients = ?, instructions = ?, image_url = ?,
        mealie_id = ?, mealie_slug = ?, source = ?, rating = ?, effort = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      recipe.name, recipe.description ?? '', JSON.stringify(recipe.tags ?? []),
      recipe.servings ?? 4, recipe.prep_time ?? 0, recipe.cook_time ?? 0,
      JSON.stringify(recipe.ingredients ?? []), JSON.stringify(recipe.instructions ?? []),
      imageUrl, recipe.mealie_id ?? null, recipe.mealie_slug ?? null,
      recipe.source ?? 'local', recipe.rating ?? null, effort, recipe.id
    )
  } else {
    db.prepare(`
      INSERT INTO recipes (id, name, description, tags, servings, prep_time, cook_time,
        ingredients, instructions, image_url, mealie_id, mealie_slug, source, rating, effort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      recipe.id, recipe.name, recipe.description ?? '', JSON.stringify(recipe.tags ?? []),
      recipe.servings ?? 4, recipe.prep_time ?? 0, recipe.cook_time ?? 0,
      JSON.stringify(recipe.ingredients ?? []), JSON.stringify(recipe.instructions ?? []),
      imageUrl, recipe.mealie_id ?? null, recipe.mealie_slug ?? null,
      recipe.source ?? 'local', recipe.rating ?? null, effort
    )
  }
  return getRecipeById(recipe.id)!
}

export function updateRecipeRating(id: string, rating: number | null) {
  getDb().prepare("UPDATE recipes SET rating = ?, updated_at = datetime('now') WHERE id = ?").run(rating, id)
}

export function updateRecipeEffort(id: string, effort: RecipeEffort | null) {
  getDb().prepare("UPDATE recipes SET effort = ?, updated_at = datetime('now') WHERE id = ?").run(effort, id)
}

export function getRecipeByMealieId(mealieId: string): Recipe | null {
  const row = getDb().prepare('SELECT * FROM recipes WHERE mealie_id = ?').get(mealieId) as Record<string, unknown> | undefined
  return row ? parseRecipe(row) : null
}

/**
 * Delete a recipe locally. Planned evenings that used it keep the recipe's
 * name as a free-text meal instead of turning blank (the FK sets recipe_id
 * to NULL); Swipen votes for it are removed by the cascade.
 */
export function deleteRecipe(id: string) {
  const db = getDb()
  db.transaction(() => {
    db.prepare(`
      UPDATE meal_plan
      SET custom_meal_name = COALESCE(NULLIF(custom_meal_name, ''), (SELECT name FROM recipes WHERE id = ?))
      WHERE recipe_id = ?
    `).run(id, id)
    db.prepare('DELETE FROM recipes WHERE id = ?').run(id)
  })()
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

/** Recipe summary from a `recipe_*` column join (meal plan, nominations). */
function joinedRecipe(row: Record<string, unknown>): Recipe {
  const id = row.recipe_id as string
  return {
    id,
    name: row.recipe_name as string,
    image_url: publicImageUrl(id, row.recipe_image),
    tags: JSON.parse(row.recipe_tags as string || '[]'),
    prep_time: row.prep_time as number,
    cook_time: row.cook_time as number,
    servings: row.recipe_servings as number,
    mealie_id: row.mealie_id as string | null,
    mealie_slug: row.mealie_slug as string | null,
    source: row.recipe_source as 'local' | 'mealie',
    rating: row.recipe_rating as number | null,
    effort: parseEffort(row.recipe_effort),
  } as Recipe
}

export function getMealPlanRange(startDate: string, endDate: string): MealPlanEntry[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT mp.*, r.name as recipe_name, r.image_url as recipe_image,
           r.tags as recipe_tags, r.prep_time, r.cook_time, r.servings as recipe_servings,
           r.mealie_id, r.mealie_slug, r.source as recipe_source, r.rating as recipe_rating,
           r.effort as recipe_effort
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
    status: 'approved' as const,
    suggested_by: row.suggested_by as string || '',
    created_at: row.created_at as string,
    recipe: row.recipe_id ? joinedRecipe(row) : undefined,
  }))
}

export function addMealPlanEntry(entry: Omit<MealPlanEntry, 'created_at' | 'recipe'>): MealPlanEntry {
  const db = getDb()
  db.transaction(() => {
    const existing = db.prepare(`
      SELECT id FROM meal_plan
      WHERE date = ? AND meal_type = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `).get(entry.date, 'dinner') as { id: string } | undefined

    if (existing) {
      db.prepare(`
        UPDATE meal_plan SET
          id = ?, recipe_id = ?, custom_meal_name = ?, servings = ?,
          notes = ?, status = ?, suggested_by = ?
        WHERE id = ?
      `).run(
        entry.id, entry.recipe_id ?? null, entry.custom_meal_name ?? null,
        entry.servings, entry.notes ?? '', 'approved',
        entry.suggested_by ?? '', existing.id
      )
    } else {
      db.prepare(`
        INSERT INTO meal_plan (id, date, meal_type, recipe_id, custom_meal_name, servings, notes, status, suggested_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.id, entry.date, 'dinner',
        entry.recipe_id ?? null, entry.custom_meal_name ?? null,
        entry.servings, entry.notes ?? '',
        'approved', entry.suggested_by ?? ''
      )
    }
  })()
  // Approval is abolished: every stored entry is approved.
  return { ...entry, status: 'approved', created_at: new Date().toISOString() }
}

export function updateMealPlanEntry(id: string, data: Partial<MealPlanEntry>) {
  const db = getDb()
  if (data.status !== undefined) {
    // Legacy clients may still send a status; it always resolves to approved.
    db.prepare("UPDATE meal_plan SET status = 'approved' WHERE id = ?").run(id)
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

export function deleteMealPlanRange(startDate: string, endDate: string) {
  getDb().prepare('DELETE FROM meal_plan WHERE date BETWEEN ? AND ?').run(startDate, endDate)
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
           r.mealie_id, r.mealie_slug, r.source as recipe_source, r.rating as recipe_rating,
           r.effort as recipe_effort
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
    recipe: joinedRecipe(row),
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

export function deleteNominationsForRange(startDate: string, endDate: string) {
  getDb().prepare('DELETE FROM nominations WHERE date BETWEEN ? AND ?').run(startDate, endDate)
}

// --- Shopping List ---
export type ShoppingItem = {
  id: string
  name: string
  normalized_name: string
  amount: string
  unit: string
  category: string
  checked: boolean
  source: 'manual' | 'meal_plan' | 'ha'
  meal_plan_id: string | null
  ha_uid: string | null
  ha_summary: string | null
  sort_order: number
  last_seen_in_ha_at: string | null
  last_synced_to_ha_at: string | null
  sync_status: string
  /** Names of the recipes this item was generated from (JSON array column). */
  recipe_names: string[]
  /** Meal plan entry ids this item was generated from (JSON array column). */
  meal_plan_ids: string[]
  updated_at: string
  created_at: string
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function parseShoppingRow(row: Record<string, unknown>): ShoppingItem {
  return {
    ...row,
    checked: !!row.checked,
    normalized_name: row.normalized_name ?? String(row.name ?? '').toLowerCase().trim(),
    ha_uid: row.ha_uid ?? null,
    ha_summary: row.ha_summary ?? null,
    last_seen_in_ha_at: row.last_seen_in_ha_at ?? null,
    last_synced_to_ha_at: row.last_synced_to_ha_at ?? null,
    sync_status: row.sync_status ?? 'ok',
    recipe_names: parseStringArray(row.recipe_names),
    meal_plan_ids: parseStringArray(row.meal_plan_ids),
  } as ShoppingItem
}

const CATEGORIES = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other']

export function getAllShoppingItems(): ShoppingItem[] {
  const rows = getDb().prepare('SELECT * FROM shopping_list ORDER BY category ASC, sort_order ASC, name ASC').all() as Record<string, unknown>[]
  return rows.map(parseShoppingRow)
}

export function getShoppingItemById(id: string): ShoppingItem | null {
  const row = getDb().prepare('SELECT * FROM shopping_list WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? parseShoppingRow(row) : null
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
  return row ? { ...parseShoppingRow(row), ha_uid: null } : null
}

type ShoppingItemDefaults = 'normalized_name' | 'ha_summary' | 'last_seen_in_ha_at' | 'last_synced_to_ha_at' | 'sync_status' | 'recipe_names' | 'meal_plan_ids'

export function addShoppingItem(
  item: Omit<ShoppingItem, 'created_at' | 'updated_at' | ShoppingItemDefaults>
    & Partial<Pick<ShoppingItem, ShoppingItemDefaults>>
): ShoppingItem {
  const normalizedName = item.normalized_name ?? item.name.toLowerCase().trim()
  const mealPlanIds = item.meal_plan_ids ?? (item.meal_plan_id ? [item.meal_plan_id] : [])
  const recipeNames = item.recipe_names ?? []
  getDb().prepare(`
    INSERT INTO shopping_list (
      id, name, amount, unit, category, checked, source, meal_plan_id,
      ha_uid, ha_summary, normalized_name, last_seen_in_ha_at,
      last_synced_to_ha_at, sync_status, sort_order, recipe_names, meal_plan_ids
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    item.id, item.name, item.amount, item.unit, item.category,
    item.checked ? 1 : 0, item.source, item.meal_plan_id ?? null,
    item.ha_uid ?? null, item.ha_summary ?? null, normalizedName,
    item.last_seen_in_ha_at ?? null, item.last_synced_to_ha_at ?? null,
    item.sync_status ?? 'ok', item.sort_order,
    JSON.stringify(recipeNames), JSON.stringify(mealPlanIds)
  )
  const now = new Date().toISOString()
  return {
    ...item,
    normalized_name: normalizedName,
    ha_summary: item.ha_summary ?? null,
    last_seen_in_ha_at: item.last_seen_in_ha_at ?? null,
    last_synced_to_ha_at: item.last_synced_to_ha_at ?? null,
    sync_status: item.sync_status ?? 'ok',
    recipe_names: recipeNames,
    meal_plan_ids: mealPlanIds,
    created_at: now,
    updated_at: now,
  }
}

export function toggleShoppingItem(id: string) {
  getDb().prepare("UPDATE shopping_list SET checked = NOT checked, updated_at = datetime('now') WHERE id = ?").run(id)
}

export function checkShoppingItem(id: string) {
  getDb().prepare("UPDATE shopping_list SET checked = 1, updated_at = datetime('now') WHERE id = ?").run(id)
}

export function setShoppingItemChecked(id: string, checked: boolean) {
  getDb().prepare("UPDATE shopping_list SET checked = ?, updated_at = datetime('now') WHERE id = ?").run(checked ? 1 : 0, id)
}

export function setShoppingItemHaUid(id: string, haUid: string, haSummary?: string) {
  getDb().prepare(`
    UPDATE shopping_list
    SET ha_uid = ?, ha_summary = COALESCE(?, ha_summary), last_synced_to_ha_at = datetime('now'),
        last_seen_in_ha_at = datetime('now'), sync_status = 'ok', updated_at = datetime('now')
    WHERE id = ?
  `).run(haUid, haSummary ?? null, id)
}

export function markShoppingItemSeenInHa(id: string, haUid: string, haSummary: string) {
  getDb().prepare(`
    UPDATE shopping_list
    SET ha_uid = ?, ha_summary = ?, last_seen_in_ha_at = datetime('now'),
        sync_status = 'ok', checked = 0, updated_at = datetime('now')
    WHERE id = ?
  `).run(haUid, haSummary, id)
}

export function markShoppingItemSyncStatus(id: string, status: string) {
  getDb().prepare("UPDATE shopping_list SET sync_status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id)
}

export function setShoppingItemCategory(id: string, category: string) {
  getDb().prepare(`
    UPDATE shopping_list
    SET category = ?, sync_status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(category, category === 'other' ? 'needs_category' : 'ok', id)
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

// --- Sync runs ---
export function createSyncRun(id: string, type: string) {
  getDb().prepare('INSERT INTO sync_runs (id, type, status) VALUES (?, ?, ?)').run(id, type, 'running')
}

export function finishSyncRun(id: string, status: string, summary: unknown, error = '') {
  getDb().prepare(`
    UPDATE sync_runs
    SET status = ?, finished_at = datetime('now'), summary = ?, error = ?
    WHERE id = ?
  `).run(status, JSON.stringify(summary), error, id)
}

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


// --- Usage events ---
export const EVENT_RETENTION_DAYS = 180

export type EventStats = {
  since: string
  total: number
  byName: Record<string, number>
  byUser: Record<string, number>
  byDay: Record<string, number>
}

let lastEventPruneDay = ''

/** Store one usage event. Prunes rows older than EVENT_RETENTION_DAYS at most once per day. */
export function addEvent(name: string, user: string, props: string, now = new Date()) {
  const db = getDb()
  db.prepare('INSERT INTO events (name, user_name, props, created_at) VALUES (?, ?, ?, ?)')
    .run(name, user, props, sqliteDateTime(now))
  const today = now.toISOString().slice(0, 10)
  if (lastEventPruneDay !== today) {
    lastEventPruneDay = today
    const cutoff = new Date(now.getTime() - EVENT_RETENTION_DAYS * 86400000)
    db.prepare('DELETE FROM events WHERE created_at < ?').run(sqliteDateTime(cutoff))
  }
}

/** Aggregate events of the last `days` days (UTC calendar days). */
export function getEventStats(days: number, now = new Date()): EventStats {
  const since = new Date(now.getTime() - days * 86400000)
  const sinceStr = sqliteDateTime(since)
  const db = getDb()
  const total = (db.prepare('SELECT COUNT(*) AS n FROM events WHERE created_at >= ?').get(sinceStr) as { n: number }).n
  const toMap = (rows: { k: string; n: number }[]) => Object.fromEntries(rows.map(r => [r.k, r.n]))
  return {
    since: since.toISOString(),
    total,
    byName: toMap(db.prepare('SELECT name AS k, COUNT(*) AS n FROM events WHERE created_at >= ? GROUP BY name ORDER BY n DESC').all(sinceStr) as { k: string; n: number }[]),
    byUser: toMap(db.prepare('SELECT user_name AS k, COUNT(*) AS n FROM events WHERE created_at >= ? GROUP BY user_name ORDER BY n DESC').all(sinceStr) as { k: string; n: number }[]),
    byDay: toMap(db.prepare('SELECT substr(created_at, 1, 10) AS k, COUNT(*) AS n FROM events WHERE created_at >= ? GROUP BY k ORDER BY k ASC').all(sinceStr) as { k: string; n: number }[]),
  }
}

/** `YYYY-MM-DD HH:MM:SS` in UTC, the format of SQLite's datetime('now'). */
function sqliteDateTime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}
