import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'

// A database from before the never_again column, where rating 1 meant
// "nicht nochmal". Built BEFORE lib/db is imported so migrate() runs on it.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vommeal-never-'))
process.env.DATA_DIR = tmpDir

const legacy = new Database(path.join(tmpDir, 'vommeal.db'))
legacy.exec(`
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE recipes (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', tags TEXT DEFAULT '[]',
    servings INTEGER DEFAULT 4, prep_time INTEGER DEFAULT 0, cook_time INTEGER DEFAULT 0,
    ingredients TEXT DEFAULT '[]', instructions TEXT DEFAULT '[]', image_url TEXT DEFAULT '',
    mealie_id TEXT UNIQUE, mealie_slug TEXT, source TEXT DEFAULT 'local', rating INTEGER,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  );
  INSERT INTO recipes (id, name, rating) VALUES ('blocked', 'Leber', 1);
  INSERT INTO recipes (id, name, rating) VALUES ('fine', 'Lasagne', 4);
  INSERT INTO recipes (id, name, rating) VALUES ('unrated', 'Brot', NULL);
`)
legacy.close()

const db = await import('../lib/db')
const { pickSuggestions } = await import('../lib/suggest')
const { autofillCandidates } = await import('../lib/autofillPlan')

afterAll(() => {
  db.getDb().close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('never_again migration (B10)', () => {
  it('keeps recipes rated 1 before the migration blocked', () => {
    expect(db.getRecipeById('blocked')!.never_again).toBe(true)
    expect(db.getRecipeById('blocked')!.rating).toBe(1)
    expect(db.getRecipeById('fine')!.never_again).toBe(false)
    expect(db.getRecipeById('unrated')!.never_again).toBe(false)
    expect(db.getSetting('migration_never_again_v1')).toBe('1')
  })

  it('does not block a recipe rated 1 after the migration', () => {
    db.updateRecipeRating('fine', 1)
    const all = db.getAllRecipes()
    expect(pickSuggestions(all, [], { today: '2026-09-25', count: 5, random: () => 0 }).map(r => r.id).sort())
      .toEqual(['fine', 'unrated'])
    expect(autofillCandidates(all, 5).map(r => r.id).sort()).toEqual(['fine', 'unrated'])
  })

  it('blocks and unblocks only through the explicit flag, and Mealie upserts keep it', () => {
    db.updateRecipeNeverAgain('unrated', true)
    // A Mealie sync rewrites the recipe (including its rating) but not the local flag
    db.upsertRecipe({ id: 'unrated', name: 'Brot', rating: 5, source: 'mealie' })
    expect(db.getRecipeById('unrated')!.never_again).toBe(true)
    expect(pickSuggestions(db.getAllRecipes(), [], { today: '2026-09-25', count: 5, random: () => 0 }).map(r => r.id))
      .toEqual(['fine'])
    db.updateRecipeNeverAgain('blocked', false)
    expect(db.getRecipeById('blocked')!.never_again).toBe(false)
  })
})
