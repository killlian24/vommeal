import { describe, it, expect } from 'vitest'
import {
  parseDbTime, partnerChanges, partnerHint, addMarks, pruneMarks, dropMarks, MARK_TTL_MS, type ChangedEntry,
} from '../lib/partnerChanges'

const since = parseDbTime('2026-09-27 10:00:00')
const e = (id: string, o: Partial<ChangedEntry>): ChangedEntry => ({
  id, date: '2026-09-28', suggested_by: 'Susi', created_at: '2026-09-20 08:00:00', ...o,
})

describe('parseDbTime', () => {
  it('reads SQLite UTC times with and without milliseconds, and ISO', () => {
    expect(parseDbTime('2026-09-27 10:00:00')).toBe(Date.UTC(2026, 8, 27, 10))
    expect(parseDbTime('2026-09-27 10:00:00.250')).toBe(Date.UTC(2026, 8, 27, 10, 0, 0, 250))
    expect(parseDbTime('2026-09-27T10:00:00.000Z')).toBe(Date.UTC(2026, 8, 27, 10))
    expect(parseDbTime('')).toBe(0)
    expect(parseDbTime('kaputt')).toBe(0)
  })
})

describe('partnerChanges', () => {
  it('finds evenings the partner planned or changed since the last look', () => {
    const entries = [
      e('new', { created_at: '2026-09-27 11:00:00', updated_at: '2026-09-27 11:00:00', updated_by: 'Susi' }),
      e('replaced', { updated_at: '2026-09-27 12:00:00.5', updated_by: 'Susi' }),
      e('old', { updated_at: '2026-09-26 12:00:00', updated_by: 'Susi' }),
      e('mine', { suggested_by: 'Kilian', updated_at: '2026-09-27 12:00:00', updated_by: 'Kilian' }),
    ]
    const r = partnerChanges(entries, 'Kilian', since)
    expect(r.planned.map(x => x.id)).toEqual(['new'])
    expect(r.changed.map(x => x.id)).toEqual(['replaced'])
  })

  it('counts who moved it, not who planned it', () => {
    const movedByMe = e('a', { suggested_by: 'Susi', updated_at: '2026-09-27 12:00:00', updated_by: 'Kilian' })
    const movedBySusi = e('b', { suggested_by: 'Kilian', updated_at: '2026-09-27 12:00:00', updated_by: 'Susi' })
    expect(partnerChanges([movedByMe, movedBySusi], 'Kilian', since).changed.map(x => x.id)).toEqual(['b'])
  })

  it('ignores Swipen matches both agreed on, and the first visit', () => {
    const match = e('m', { suggested_by: 'Kilian & Susi', updated_by: 'Kilian & Susi', updated_at: '2026-09-27 12:00:00' })
    expect(partnerChanges([match], 'Kilian', since).changed).toEqual([])
    const fresh = e('f', { updated_at: '2026-09-27 12:00:00', updated_by: 'Susi' })
    expect(partnerChanges([fresh], 'Kilian', 0).changed).toEqual([])
  })
})

describe('partnerHint', () => {
  it('says what the partner did', () => {
    const a = e('a', { updated_by: 'Susi' })
    expect(partnerHint([a, a], [])).toBe('Susi hat 2 Abende geplant')
    expect(partnerHint([], [a])).toBe('Susi hat 1 Abend geändert')
    expect(partnerHint([a], [a])).toBe('Susi hat 1 Abend geplant und 1 geändert')
    expect(partnerHint([], [])).toBeNull()
  })
})

describe('marks', () => {
  it('expire after 24 h and go once seen', () => {
    const now = 10 * MARK_TTL_MS
    let m = addMarks({}, ['a', 'b'], now - MARK_TTL_MS - 1)
    m = addMarks(m, ['c'], now)
    expect(Object.keys(pruneMarks(m, now))).toEqual(['c'])
    expect(dropMarks(m, ['a', 'c'])).toEqual({ b: now - MARK_TTL_MS - 1 })
    expect(dropMarks(m, ['x'])).toBe(m)
  })
})
