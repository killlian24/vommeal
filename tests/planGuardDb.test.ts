import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vommeal-guard-'))
process.env.DATA_DIR = tmpDir

const db = await import('../lib/db')

afterAll(() => {
  db.getDb().close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => { db.getDb().exec('DELETE FROM meal_plan') })

const entry = (id: string, date: string, name: string, by = 'Kilian') => ({
  id, date, meal_type: 'dinner' as const, recipe_id: null, custom_meal_name: name,
  servings: 2, notes: '', status: 'approved' as const, suggested_by: by,
})
const onDate = (date: string) => db.getMealPlanRange(date, date)

describe('addMealPlanEntryIfExpected (B1)', () => {
  it('plans a free evening when it expects one', () => {
    const r = db.addMealPlanEntryIfExpected(entry('a', '2026-10-03', 'Tajine'), { expectEmpty: true })
    expect(r.ok).toBe(true)
    expect(onDate('2026-10-03').map(e => e.custom_meal_name)).toEqual(['Tajine'])
  })

  it('does not overwrite what the partner planned on a stale screen', () => {
    db.addMealPlanEntry(entry('s', '2026-10-03', 'Shakshuka', 'Susi'))
    const r = db.addMealPlanEntryIfExpected(entry('k', '2026-10-03', 'Tajine'), { expectEmpty: true })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.current.id).toBe('s')
      expect(r.current.custom_meal_name).toBe('Shakshuka')
      expect(r.current.suggested_by).toBe('Susi')
    }
    expect(onDate('2026-10-03').map(e => e.custom_meal_name)).toEqual(['Shakshuka'])
  })

  it('replaces the known entry, but not a different one', () => {
    db.addMealPlanEntry(entry('old', '2026-10-04', 'Pasta'))
    const stale = db.addMealPlanEntryIfExpected(entry('n1', '2026-10-04', 'Curry'), { replaceId: 'other' })
    expect(stale.ok).toBe(false)
    const ok = db.addMealPlanEntryIfExpected(entry('n2', '2026-10-04', 'Curry'), { replaceId: 'old' })
    expect(ok.ok).toBe(true)
    expect(onDate('2026-10-04').map(e => [e.id, e.custom_meal_name])).toEqual([['n2', 'Curry']])
  })

  it('treats a replace on an evening that became free as fine', () => {
    const r = db.addMealPlanEntryIfExpected(entry('n', '2026-10-05', 'Curry'), { replaceId: 'gone' })
    expect(r.ok).toBe(true)
  })

  it('keeps the old last-write-wins behaviour without an expectation', () => {
    db.addMealPlanEntry(entry('s', '2026-10-06', 'Shakshuka', 'Susi'))
    const r = db.addMealPlanEntryIfExpected(entry('k', '2026-10-06', 'Tajine'))
    expect(r.ok).toBe(true)
    expect(onDate('2026-10-06').map(e => e.custom_meal_name)).toEqual(['Tajine'])
  })

  it('undo restores the removed entry with its id only onto a free day', () => {
    db.addMealPlanEntry(entry('x', '2026-10-07', 'Linsen'))
    expect(db.deleteMealPlanEntry('x')).toBe(true)
    db.addMealPlanEntry(entry('p', '2026-10-07', 'Pizza', 'Susi'))
    expect(db.addMealPlanEntryIfExpected(entry('x', '2026-10-07', 'Linsen'), { expectEmpty: true }).ok).toBe(false)
    expect(onDate('2026-10-07').map(e => e.id)).toEqual(['p'])
  })
})

describe('deleteMealPlanEntry (B3)', () => {
  it('reports whether something was removed', () => {
    db.addMealPlanEntry(entry('d', '2026-10-08', 'Suppe'))
    expect(db.deleteMealPlanEntry('d')).toBe(true)
    expect(db.deleteMealPlanEntry('d')).toBe(false)
    expect(db.deleteMealPlanEntry('never-existed')).toBe(false)
  })
})

describe('deleteMealPlanRange (B9)', () => {
  it('deletes only the given range and returns the removed entries for undo', () => {
    db.addMealPlanEntry(entry('past', '2026-09-28', 'Gestern'))
    db.addMealPlanEntry(entry('t', '2026-09-30', 'Heute'))
    db.addMealPlanEntry(entry('f', '2026-10-02', 'Freitag'))
    // The week page passes today..Sunday for the current week
    const removed = db.deleteMealPlanRange('2026-09-30', '2026-10-04')
    expect(removed.map(e => e.id)).toEqual(['t', 'f'])
    expect(db.getMealPlanRange('2026-09-28', '2026-10-04').map(e => e.id)).toEqual(['past'])
    // Undo puts them back with their ids while the evenings are still free
    for (const e of removed) {
      expect(db.addMealPlanEntryIfExpected({ ...e, status: 'approved' }, { expectEmpty: true }).ok).toBe(true)
    }
    expect(db.getMealPlanRange('2026-09-28', '2026-10-04').map(e => e.id)).toEqual(['past', 't', 'f'])
  })
})
