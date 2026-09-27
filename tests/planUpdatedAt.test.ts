import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'

// A database from before updated_at / updated_by. Built BEFORE lib/db is
// imported so migrate() runs on it.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vommeal-updated-'))
process.env.DATA_DIR = tmpDir

const legacy = new Database(path.join(tmpDir, 'vommeal.db'))
legacy.exec(`
  CREATE TABLE meal_plan (
    id TEXT PRIMARY KEY, date TEXT NOT NULL, meal_type TEXT NOT NULL DEFAULT 'dinner',
    recipe_id TEXT, custom_meal_name TEXT, servings INTEGER DEFAULT 2, notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'approved', suggested_by TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  INSERT INTO meal_plan (id, date, custom_meal_name, suggested_by, created_at)
    VALUES ('old', '2026-10-01', 'Tajine', 'Susi', '2026-09-01 08:00:00');
`)
legacy.close()

const db = await import('../lib/db')

afterAll(() => {
  db.getDb().close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const OLD = '2020-01-01 00:00:00'
const entry = (id: string, date: string, name: string, by = 'Kilian') => ({
  id, date, meal_type: 'dinner' as const, recipe_id: null, custom_meal_name: name,
  servings: 2, notes: '', status: 'approved' as const, suggested_by: by,
})
const row = (id: string) => db.getDb().prepare('SELECT * FROM meal_plan WHERE id = ?').get(id) as Record<string, string>
const age = (...ids: string[]) => {
  for (const id of ids) db.getDb().prepare('UPDATE meal_plan SET updated_at = ?, updated_by = ? WHERE id = ?').run(OLD, 'x', id)
}

describe('meal_plan.updated_at migration', () => {
  it('backfills existing evenings from created_at and suggested_by', () => {
    const r = row('old')
    expect(r.updated_at).toBe('2026-09-01 08:00:00')
    expect(r.updated_by).toBe('Susi')
    const [e] = db.getMealPlanRange('2026-10-01', '2026-10-01')
    expect(e.updated_at).toBe('2026-09-01 08:00:00')
    expect(e.updated_by).toBe('Susi')
  })
})

describe('updated_at / updated_by on changes', () => {
  beforeEach(() => { db.getDb().exec("DELETE FROM meal_plan WHERE id <> 'old'") })

  it('is set when planning', () => {
    db.addMealPlanEntry(entry('a', '2026-10-05', 'Pasta', 'Susi'))
    const r = row('a')
    expect(r.updated_at > OLD).toBe(true)
    expect(r.updated_by).toBe('Susi')
  })

  it('is bumped when replacing, created_at stays', () => {
    db.addMealPlanEntry(entry('a', '2026-10-05', 'Pasta', 'Kilian'))
    const created = row('a').created_at
    age('a')
    db.addMealPlanEntryIfExpected(entry('b', '2026-10-05', 'Curry', 'Susi'), { replaceId: 'a' })
    const r = row('b')
    expect(r.created_at).toBe(created)
    expect(r.updated_at > OLD).toBe(true)
    expect(r.updated_by).toBe('Susi')
  })

  it('is bumped by a move and a swap, with who moved', () => {
    db.addMealPlanEntry(entry('a', '2026-10-05', 'Pasta'))
    db.addMealPlanEntry(entry('b', '2026-10-06', 'Curry'))
    age('a', 'b')
    const res = db.moveMealPlanEntry('a', '2026-10-06', 'Susi')
    expect(res.ok).toBe(true)
    for (const id of ['a', 'b']) {
      expect(row(id).updated_at > OLD).toBe(true)
      expect(row(id).updated_by).toBe('Susi')
    }
  })

  it('is bumped by a shift and by an undo (reorder)', () => {
    db.addMealPlanEntry(entry('a', '2026-10-05', 'Pasta'))
    age('a')
    const res = db.shiftMealPlan('2026-10-05', 1, null, 'Susi')
    expect(res.ok).toBe(true)
    expect(row('a').date).toBe('2026-10-06')
    expect(row('a').updated_by).toBe('Susi')
    age('a')
    db.reorderMealPlan([{ id: 'a', date: '2026-10-05' }], 'Kilian')
    expect(row('a').updated_at > OLD).toBe(true)
    expect(row('a').updated_by).toBe('Kilian')
  })

  it('is bumped by an edit (notes)', () => {
    db.addMealPlanEntry(entry('a', '2026-10-05', 'Pasta'))
    age('a')
    db.updateMealPlanEntry('a', { notes: 'mit Salat' })
    expect(row('a').updated_at > OLD).toBe(true)
  })
})
