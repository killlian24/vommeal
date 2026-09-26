import type Database from 'better-sqlite3'
import { getDb } from './db'

/**
 * Which planned meals have already been shopped for ("Zutaten der Woche").
 *
 * A meal counts as added once at least one of its ingredients went onto the list (add_selected,
 * generate, add_date) or the user marked it "schon eingekauft". Unlike the meal ids stored on
 * shopping rows, this survives checking off and clearing the bought rows, and it survives moving
 * the meal to another day (meal_plan ids are stable across moves).
 *
 * `recipe_id` remembers which dish was shopped for: if the meal is later swapped for another
 * recipe, the mark no longer applies. Rows for meals that no longer exist are pruned once per
 * process.
 */

const ready = new WeakSet<Database.Database>()
const BACKFILL_KEY = 'shopping_meal_added_backfill_v1'

function parseIds(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : []
  } catch {
    return []
  }
}

/** Every meal-plan id referenced by any shopping row (meal_plan_ids JSON + legacy meal_plan_id). */
function idsOnShoppingRows(db: Database.Database): string[] {
  const rows = db.prepare('SELECT meal_plan_id, meal_plan_ids FROM shopping_list').all() as
    { meal_plan_id: string | null; meal_plan_ids: unknown }[]
  const ids = new Set<string>()
  for (const row of rows) {
    parseIds(row.meal_plan_ids).forEach(id => ids.add(id))
    if (row.meal_plan_id) ids.add(row.meal_plan_id)
  }
  return Array.from(ids)
}

function insertMarks(db: Database.Database, ids: string[]) {
  const stmt = db.prepare(`
    INSERT INTO shopping_meal_added (meal_plan_id, added_at, recipe_id)
    SELECT id, datetime('now'), recipe_id FROM meal_plan WHERE id = ?
    ON CONFLICT(meal_plan_id) DO UPDATE SET added_at = excluded.added_at, recipe_id = excluded.recipe_id
  `)
  for (const id of ids) stmt.run(id)
}

/** Create the table on first use, backfill it once from the shopping rows, prune stale rows. */
function db(): Database.Database {
  const conn = getDb()
  if (ready.has(conn)) return conn
  conn.exec(`
    CREATE TABLE IF NOT EXISTS shopping_meal_added (
      meal_plan_id TEXT PRIMARY KEY,
      added_at TEXT NOT NULL,
      recipe_id TEXT
    )
  `)
  conn.transaction(() => {
    const done = conn.prepare('SELECT value FROM settings WHERE key = ?').get(BACKFILL_KEY) as { value: string } | undefined
    if (!done) {
      insertMarks(conn, idsOnShoppingRows(conn))
      conn.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(BACKFILL_KEY, '1')
    }
    conn.prepare('DELETE FROM shopping_meal_added WHERE meal_plan_id NOT IN (SELECT id FROM meal_plan)').run()
  })()
  ready.add(conn)
  return conn
}

function clean(ids: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(ids).filter(id => typeof id === 'string' && id.trim() !== '')))
}

/** Record meals as shopped for. Ids that are not planned meals are ignored. */
export function markMealsAdded(ids: Iterable<string>): void {
  const list = clean(ids)
  if (list.length === 0) return
  const conn = db()
  conn.transaction(() => insertMarks(conn, list))()
}

/**
 * Forget that meals were shopped for. Also drops these meal ids from the shopping rows' sources so
 * the meals really count as open again (the rows keep their recipe names, so "für …" stays).
 */
export function unmarkMeals(ids: Iterable<string>): void {
  const list = clean(ids)
  if (list.length === 0) return
  const conn = db()
  const drop = new Set(list)
  conn.transaction(() => {
    const del = conn.prepare('DELETE FROM shopping_meal_added WHERE meal_plan_id = ?')
    for (const id of list) del.run(id)

    const rows = conn.prepare('SELECT id, meal_plan_id, meal_plan_ids FROM shopping_list').all() as
      { id: string; meal_plan_id: string | null; meal_plan_ids: unknown }[]
    const update = conn.prepare(`
      UPDATE shopping_list SET meal_plan_ids = ?, meal_plan_id = ?, updated_at = datetime('now') WHERE id = ?
    `)
    for (const row of rows) {
      const ids = parseIds(row.meal_plan_ids)
      const legacyHit = !!row.meal_plan_id && drop.has(row.meal_plan_id)
      if (!legacyHit && !ids.some(id => drop.has(id))) continue
      const kept = ids.filter(id => !drop.has(id))
      const legacy = row.meal_plan_id && !drop.has(row.meal_plan_id) ? row.meal_plan_id : kept[0] ?? null
      update.run(JSON.stringify(kept), legacy, row.id)
    }
  })()
}

/**
 * Meal ids recorded as shopped for whose dish is still the one that was shopped for.
 * With `ids`, only those are checked.
 */
export function getAddedMealIds(ids?: Iterable<string>): Set<string> {
  const conn = db()
  const rows = conn.prepare(`
    SELECT a.meal_plan_id AS id
    FROM shopping_meal_added a
    JOIN meal_plan mp ON mp.id = a.meal_plan_id
    WHERE a.recipe_id IS NULL OR a.recipe_id IS mp.recipe_id
  `).all() as { id: string }[]
  const all = new Set(rows.map(r => r.id))
  if (!ids) return all
  return new Set(clean(ids).filter(id => all.has(id)))
}
