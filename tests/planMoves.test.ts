import { describe, it, expect } from 'vitest'
import { addDaysIso, consecutiveChain, planShift, planMove, planReorder, applyMoves } from '../lib/planMoves'
import type { PlanSlot } from '../lib/planMoves'

// 2026-09-28 is a Monday; 2026-10-04 the Sunday of that week.
const s = (id: string, date: string): PlanSlot => ({ id, date })

describe('addDaysIso', () => {
  it('crosses month, year and DST boundaries', () => {
    expect(addDaysIso('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysIso('2026-10-25', 1)).toBe('2026-10-26') // DST ends in Europe
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('consecutiveChain', () => {
  it('stops at the first free evening', () => {
    const slots = [s('a', '2026-09-28'), s('b', '2026-09-29'), s('c', '2026-10-01')]
    expect(consecutiveChain(slots, '2026-09-28')).toEqual(['2026-09-28', '2026-09-29'])
  })

  it('is empty when nothing is planned on the start day', () => {
    expect(consecutiveChain([s('a', '2026-09-29')], '2026-09-28')).toEqual([])
  })

  it('continues across the week boundary', () => {
    const slots = [s('sa', '2026-10-03'), s('so', '2026-10-04'), s('mo', '2026-10-05')]
    expect(consecutiveChain(slots, '2026-10-03')).toEqual(['2026-10-03', '2026-10-04', '2026-10-05'])
  })
})

describe('planShift +1', () => {
  it('moves the chain one day later and lets the gap absorb it', () => {
    const slots = [s('fr', '2026-10-02'), s('sa', '2026-10-03'), s('mo', '2026-10-05')]
    const r = planShift(slots, '2026-10-02', 1)
    expect(r).toEqual({
      ok: true,
      moves: [
        { id: 'fr', from: '2026-10-02', to: '2026-10-03' },
        { id: 'sa', from: '2026-10-03', to: '2026-10-04' },
      ],
    })
    // Monday stays untouched: Sunday was free and took the shift.
    const after = applyMoves(slots, r.ok ? r.moves : [])
    expect(after.map(x => x.date)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05'])
  })

  it('moves a Sunday entry into next week', () => {
    const r = planShift([s('so', '2026-10-04')], '2026-10-04', 1)
    expect(r.ok && r.moves).toEqual([{ id: 'so', from: '2026-10-04', to: '2026-10-05' }])
  })

  it('pushes a chain over the week boundary until the first gap', () => {
    const slots = [s('sa', '2026-10-03'), s('so', '2026-10-04'), s('mo', '2026-10-05'), s('mi', '2026-10-07')]
    const r = planShift(slots, '2026-10-03', 1)
    expect(r.ok && r.moves.map(m => `${m.id}:${m.to}`)).toEqual(['sa:2026-10-04', 'so:2026-10-05', 'mo:2026-10-06'])
  })

  it('ignores entries before the start day', () => {
    const slots = [s('do', '2026-10-01'), s('fr', '2026-10-02')]
    const r = planShift(slots, '2026-10-02', 1)
    expect(r.ok && r.moves.map(m => m.id)).toEqual(['fr'])
  })

  it('fails when nothing is planned on the start day', () => {
    expect(planShift([s('a', '2026-10-03')], '2026-10-02', 1)).toEqual({ ok: false, error: 'An diesem Tag ist nichts geplant' })
  })
})

describe('planShift -1', () => {
  it('pulls the chain one day earlier into a free evening', () => {
    const slots = [s('mi', '2026-09-30'), s('do', '2026-10-01'), s('sa', '2026-10-03')]
    const r = planShift(slots, '2026-09-30', -1)
    expect(r.ok && r.moves).toEqual([
      { id: 'mi', from: '2026-09-30', to: '2026-09-29' },
      { id: 'do', from: '2026-10-01', to: '2026-09-30' },
    ])
  })

  it('crosses back into the previous week', () => {
    const r = planShift([s('mo', '2026-10-05')], '2026-10-05', -1)
    expect(r.ok && r.moves).toEqual([{ id: 'mo', from: '2026-10-05', to: '2026-10-04' }])
  })

  it('fails when the evening before is taken', () => {
    const slots = [s('di', '2026-09-29'), s('mi', '2026-09-30')]
    expect(planShift(slots, '2026-09-30', -1)).toEqual({ ok: false, error: 'Der Tag davor ist schon belegt' })
  })
})

describe('planMove', () => {
  it('moves to a free evening', () => {
    const r = planMove([s('a', '2026-09-28'), s('b', '2026-09-30')], 'a', '2026-10-01')
    expect(r.ok && r.moves).toEqual([{ id: 'a', from: '2026-09-28', to: '2026-10-01' }])
  })

  it('swaps with an entry on the target evening', () => {
    const r = planMove([s('a', '2026-09-28'), s('b', '2026-09-30')], 'a', '2026-09-30')
    expect(r.ok && r.moves).toEqual([
      { id: 'a', from: '2026-09-28', to: '2026-09-30' },
      { id: 'b', from: '2026-09-30', to: '2026-09-28' },
    ])
  })

  it('swaps across weeks', () => {
    const r = planMove([s('so', '2026-10-04'), s('mo', '2026-10-05')], 'mo', '2026-10-04')
    expect(r.ok && r.moves.map(m => `${m.id}:${m.to}`)).toEqual(['mo:2026-10-04', 'so:2026-10-05'])
  })

  it('does nothing when dropped on its own evening', () => {
    expect(planMove([s('a', '2026-09-28')], 'a', '2026-09-28')).toEqual({ ok: true, moves: [] })
  })

  it('fails for an unknown id', () => {
    expect(planMove([s('a', '2026-09-28')], 'x', '2026-09-29').ok).toBe(false)
  })
})

describe('planReorder', () => {
  it('restores a shift (undo)', () => {
    const after = [s('fr', '2026-10-03'), s('sa', '2026-10-04')]
    const r = planReorder(after, [{ id: 'fr', date: '2026-10-02' }, { id: 'sa', date: '2026-10-03' }])
    expect(r.ok && r.moves.map(m => `${m.id}:${m.to}`)).toEqual(['fr:2026-10-02', 'sa:2026-10-03'])
  })

  it('restores a swap', () => {
    const after = [s('a', '2026-09-30'), s('b', '2026-09-28')]
    const r = planReorder(after, [{ id: 'a', date: '2026-09-28' }, { id: 'b', date: '2026-09-30' }])
    expect(r.ok).toBe(true)
  })

  it('rejects two entries on one evening', () => {
    const slots = [s('a', '2026-09-28'), s('b', '2026-09-29')]
    expect(planReorder(slots, [{ id: 'a', date: '2026-09-29' }])).toEqual({ ok: false, error: 'Zwei Gerichte am selben Abend' })
    expect(planReorder(slots, [{ id: 'a', date: '2026-09-30' }, { id: 'b', date: '2026-09-30' }]).ok).toBe(false)
  })

  it('rejects unknown and repeated ids', () => {
    expect(planReorder([s('a', '2026-09-28')], [{ id: 'x', date: '2026-09-29' }]).ok).toBe(false)
    expect(planReorder([s('a', '2026-09-28')], [{ id: 'a', date: '2026-09-29' }, { id: 'a', date: '2026-09-30' }]).ok).toBe(false)
  })

  it('skips entries that already sit on their target date', () => {
    const r = planReorder([s('a', '2026-09-28')], [{ id: 'a', date: '2026-09-28' }])
    expect(r).toEqual({ ok: true, moves: [] })
  })
})
