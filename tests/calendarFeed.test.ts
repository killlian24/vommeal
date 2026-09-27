import { describe, it, expect } from 'vitest'
import { buildCalendar, calendarRange, escapeText, foldLine, icsTimestamp } from '../lib/calendarFeed'
import type { PlanDisplayEntry } from '../lib/planDisplay'

const APP = 'https://vommeal.example.ts.net'
const NOW = new Date('2026-09-27T10:15:30.123Z')

const ENTRIES: PlanDisplayEntry[] = [
  {
    id: 'mp-1', date: '2026-09-28', recipe_id: 'r1', custom_meal_name: null, suggested_by: 'Kilian',
    recipe: { name: 'Linsen, Spätzle; und Saitenwürstle \\ mit Soße', image_url: '/api/images/r1?v=1' },
  },
  { id: 'mp-2', date: '2026-09-29', recipe_id: null, custom_meal_name: 'Auswärts essen', suggested_by: 'Susi' },
  { id: 'mp-3', date: '2026-09-30', recipe_id: null, custom_meal_name: 'Omas Rezept\nmit Zeilenumbruch', suggested_by: '' },
]

const build = (appUrl = APP, entries = ENTRIES) => buildCalendar({ entries, appUrl, timezone: 'Europe/Copenhagen', now: NOW })

/** Undo line folding (RFC 5545 3.1). */
const unfold = (ics: string) => ics.replace(/\r\n /g, '')
const events = (ics: string) => unfold(ics).split('BEGIN:VEVENT').slice(1).map(e => e.split('END:VEVENT')[0].split('\r\n').filter(Boolean))

describe('escapeText', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf')
  })
})

describe('foldLine', () => {
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:Pasta')).toBe('SUMMARY:Pasta')
  })

  it('folds at 75 octets without splitting multi-byte characters', () => {
    const line = `SUMMARY:${'Spätzle 🍝 '.repeat(20)}`
    const folded = foldLine(line)
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    for (const [i, part] of parts.entries()) {
      expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75)
      if (i > 0) expect(part.startsWith(' ')).toBe(true)
      // Every chunk is valid UTF-8 on its own
      expect(Buffer.from(part, 'utf8').toString('utf8')).toBe(part)
      expect(part).not.toContain('�')
    }
    expect(unfold(folded)).toBe(line)
  })
})

describe('buildCalendar', () => {
  it('uses CRLF line endings only and lines of at most 75 octets', () => {
    const ics = build()
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
  })

  it('has the calendar headers', () => {
    const lines = unfold(build()).split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('VERSION:2.0')
    expect(lines.some(l => l.startsWith('PRODID:'))).toBe(true)
    expect(lines).toContain('CALSCALE:GREGORIAN')
    expect(lines).toContain('X-WR-CALNAME:Vommeal')
    expect(lines).toContain('X-WR-TIMEZONE:Europe/Copenhagen')
    expect(lines).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H')
    expect(lines).toContain('X-PUBLISHED-TTL:PT1H')
    expect(lines.filter(Boolean).at(-1)).toBe('END:VCALENDAR')
  })

  it('writes one all-day event per evening with a stable UID', () => {
    const [first, second, third] = events(build())
    expect(first).toContain('UID:mp-1@vommeal')
    expect(first).toContain('DTSTAMP:20260927T101530Z')
    expect(first).toContain('DTSTART;VALUE=DATE:20260928')
    expect(first).toContain('DTEND;VALUE=DATE:20260929')
    expect(second).toContain('UID:mp-2@vommeal')
    expect(third).toContain('DTEND;VALUE=DATE:20261001')
    // Same UID on a later fetch, only DTSTAMP moves
    const again = events(buildCalendar({ entries: ENTRIES, appUrl: APP, timezone: 'Europe/Copenhagen', now: new Date('2026-09-28T08:00:00Z') }))
    expect(again.map(e => e.find(l => l.startsWith('UID:')))).toEqual(['UID:mp-1@vommeal', 'UID:mp-2@vommeal', 'UID:mp-3@vommeal'])
  })

  it('escapes the dish name and shows quick meals with their emoji', () => {
    const [first, second, third] = events(build())
    expect(first).toContain('SUMMARY:Linsen\\, Spätzle\\; und Saitenwürstle \\\\ mit Soße')
    expect(second).toContain('SUMMARY:🍽️ Auswärts essen')
    expect(third).toContain('SUMMARY:Omas Rezept\\nmit Zeilenumbruch')
  })

  it('describes who planned it and links the recipe only with an app address', () => {
    const [first, second, third] = events(build())
    expect(first).toContain(`DESCRIPTION:Geplant von Kilian\\nRezept: ${APP}/recipes/r1`)
    expect(first).toContain(`URL:${APP}/recipes/r1`)
    expect(second).toContain('DESCRIPTION:Geplant von Susi')
    expect(second.some(l => l.startsWith('URL:'))).toBe(false)
    expect(third.some(l => l.startsWith('DESCRIPTION:'))).toBe(false)

    const [plain] = events(build(''))
    expect(plain).toContain('DESCRIPTION:Geplant von Kilian')
    expect(plain.some(l => l.startsWith('URL:'))).toBe(false)
  })

  it('writes an empty but valid calendar without entries', () => {
    const ics = build(APP, [])
    expect(ics).not.toContain('BEGIN:VEVENT')
    expect(ics).toContain('END:VCALENDAR\r\n')
  })
})

describe('helpers', () => {
  it('formats UTC timestamps', () => {
    expect(icsTimestamp(new Date('2026-01-02T03:04:05.678Z'))).toBe('20260102T030405Z')
  })

  it('covers 14 days back and 42 ahead', () => {
    expect(calendarRange('2026-09-27')).toEqual({ start: '2026-09-13', end: '2026-11-08' })
  })
})
