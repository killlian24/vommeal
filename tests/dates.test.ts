import { describe, it, expect } from 'vitest'
import { dayLabel, shortDay, rangeLabel, relativeWeekday, weekdayName, todayIso, dayMonth } from '../lib/dates'

// 2026-09-27 is a Sunday, 2026-09-30 a Wednesday.
const TODAY = '2026-09-27'

describe('dayLabel', () => {
  it('says Heute and Morgen relative to today', () => {
    expect(dayLabel('2026-09-27', TODAY)).toBe('Heute')
    expect(dayLabel('2026-09-28', TODAY)).toBe('Morgen')
  })

  it('writes other days as "Mi 30.9."', () => {
    expect(dayLabel('2026-09-30', TODAY)).toBe('Mi 30.9.')
    expect(dayLabel('2026-09-26', TODAY)).toBe('Sa 26.9.')
    expect(dayLabel('2026-10-04', TODAY)).toBe('So 4.10.')
  })

  it('handles the turn of the month and year for Morgen', () => {
    expect(dayLabel('2026-10-01', '2026-09-30')).toBe('Morgen')
    expect(dayLabel('2027-01-01', '2026-12-31')).toBe('Morgen')
  })
})

describe('other formats', () => {
  it('shortDay never goes relative', () => {
    expect(shortDay(TODAY)).toBe('So 27.9.')
  })

  it('relativeWeekday uses the full weekday name', () => {
    expect(relativeWeekday('2026-09-27', TODAY)).toBe('Heute')
    expect(relativeWeekday('2026-09-28', TODAY)).toBe('Morgen')
    expect(relativeWeekday('2026-09-30', TODAY)).toBe('Mittwoch')
    expect(weekdayName('2026-10-03')).toBe('Samstag')
  })

  it('rangeLabel uses "bis" and no dashes', () => {
    expect(rangeLabel('2026-09-21', '2026-09-27')).toBe('21. bis 27. Sep.')
    expect(rangeLabel('2026-09-28', '2026-10-04')).toBe('28. Sep. bis 4. Okt.')
    expect(rangeLabel('2026-09-28', '2026-10-04')).not.toMatch(/[\u2013\u2014]/)
    expect(dayMonth('2026-03-02')).toBe('2. März')
  })

  it('todayIso uses the local calendar date', () => {
    expect(todayIso(new Date(2026, 8, 7, 23, 30))).toBe('2026-09-07')
  })
})
