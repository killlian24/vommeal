import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Point lib/db at a throw-away directory BEFORE it is imported, so the real
// data/vommeal.db is never touched by this test.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vommeal-test-'))
process.env.DATA_DIR = tmpDir

const db = await import('../lib/db')

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const LINE = '200 g Berglinsen oder kleine Alblinsen'
const MERGED = '1. Linsen einweichen. ,2. Teig rühren. ,Teig ruhen lassen. ,3. Gemüse würfeln. ,4. Anrichten. ,Tipp: Mehlschwitze.'

describe('one-time ingredient/instruction migration', () => {
  it('sets the guard flag on first open', () => {
    db.getDb()
    expect(db.getSetting('migration_ingredients_v1')).toBe('1')
  })

  it('normalizes stored recipes that show the unparsed pattern', () => {
    db.upsertRecipe({
      id: 'r-unparsed',
      name: 'Linsen mit Spätzle (test)',
      ingredients: [
        { amount: '0', unit: '', name: LINE, note: LINE },
        { amount: '0', unit: '', name: 'etwas Salz', note: 'etwas Salz' },
        { amount: '0', unit: '', name: '1 Kartoffel, mehligkochend', note: '1 Kartoffel, mehligkochend' },
      ],
      instructions: [{ text: MERGED }],
    })
    db.upsertRecipe({
      id: 'r-clean',
      name: 'Clean recipe',
      ingredients: [{ amount: '2', unit: 'EL', name: 'Öl', note: 'kaltgepresst' }],
      instructions: [{ text: 'Alles mischen.' }],
    })
    const cleanBefore = db.getRecipeById('r-clean')!

    expect(db.normalizeStoredRecipes(db.getDb())).toBe(1)

    const r = db.getRecipeById('r-unparsed')!
    expect(r.ingredients).toEqual([
      { amount: '200', unit: 'g', name: 'Berglinsen oder kleine Alblinsen' },
      { amount: '', unit: '', name: 'Salz' },
      { amount: '1', unit: '', name: 'Kartoffel, mehligkochend' },
    ])
    expect(r.instructions).toEqual([
      { text: 'Linsen einweichen.' },
      { text: 'Teig rühren.\nTeig ruhen lassen.' },
      { text: 'Gemüse würfeln.' },
      { text: 'Anrichten.\nTipp: Mehlschwitze.' },
    ])

    const cleanAfter = db.getRecipeById('r-clean')!
    expect(cleanAfter.ingredients).toEqual(cleanBefore.ingredients)
    expect(cleanAfter.instructions).toEqual(cleanBefore.instructions)
    expect(cleanAfter.updated_at).toBe(cleanBefore.updated_at)
  })

  it('is idempotent', () => {
    expect(db.normalizeStoredRecipes(db.getDb())).toBe(0)
  })
})
