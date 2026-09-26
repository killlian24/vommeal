import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vommeal-moves-'))
process.env.DATA_DIR = tmpDir

const db = await import('../lib/db')

afterAll(() => {
  db.getDb().close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function plan(id: string, date: string, name = id, by = 'Kilian') {
  db.getDb().prepare(
    "INSERT INTO meal_plan (id, date, custom_meal_name, suggested_by, created_at) VALUES (?, ?, ?, ?, '2026-09-01 10:00:00')"
  ).run(id, date, name, by)
}
const dates = () => Object.fromEntries(
  (db.getDb().prepare('SELECT id, date FROM meal_plan ORDER BY date').all() as { id: string; date: string }[]).map(r => [r.id, r.date])
)

beforeEach(() => { db.getDb().exec('DELETE FROM meal_plan') })

describe('shiftMealPlan', () => {
  it('shifts the chain, keeps id, created_at and suggested_by, and fills the freed evening', () => {
    plan('fr', '2026-10-02', 'Linsen', 'Susi')
    plan('sa', '2026-10-03', 'Tajine')
    plan('mo', '2026-10-05', 'Pasta')
    const r = db.shiftMealPlan('2026-10-02', 1, { id: 'fill1', name: 'Auswärts essen', suggested_by: 'Kilian' })
    expect(r.ok).toBe(true)
    expect(dates()).toEqual({ fill1: '2026-10-02', fr: '2026-10-03', sa: '2026-10-04', mo: '2026-10-05' })
    const fr = db.getDb().prepare('SELECT * FROM meal_plan WHERE id = ?').get('fr') as Record<string, string>
    expect(fr.created_at).toBe('2026-09-01 10:00:00')
    expect(fr.suggested_by).toBe('Susi')
    expect(fr.custom_meal_name).toBe('Linsen')
  })

  it('changes nothing when the day before is taken (days = -1)', () => {
    plan('di', '2026-09-29')
    plan('mi', '2026-09-30')
    const r = db.shiftMealPlan('2026-09-30', -1)
    expect(r).toEqual({ ok: false, error: 'Der Tag davor ist schon belegt' })
    expect(dates()).toEqual({ di: '2026-09-29', mi: '2026-09-30' })
  })
})

describe('moveMealPlanEntry + reorderMealPlan', () => {
  it('swaps two evenings and undoes it', () => {
    plan('a', '2026-09-28')
    plan('b', '2026-09-30')
    const r = db.moveMealPlanEntry('a', '2026-09-30')
    expect(r.ok).toBe(true)
    expect(dates()).toEqual({ b: '2026-09-28', a: '2026-09-30' })
    const undo = db.reorderMealPlan([{ id: 'a', date: '2026-09-28' }, { id: 'b', date: '2026-09-30' }])
    expect(undo.ok).toBe(true)
    expect(dates()).toEqual({ a: '2026-09-28', b: '2026-09-30' })
  })

  it('refuses a reorder that would put two dinners on one evening', () => {
    plan('a', '2026-09-28')
    plan('b', '2026-09-29')
    expect(db.reorderMealPlan([{ id: 'a', date: '2026-09-29' }]).ok).toBe(false)
    expect(dates()).toEqual({ a: '2026-09-28', b: '2026-09-29' })
  })
})
