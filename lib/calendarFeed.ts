import { addDaysIso, dishWithEmoji, entriesByDate, recipeLink } from './planDisplay'
import type { PlanDisplayEntry } from './planDisplay'

/**
 * The meal plan as an iCalendar feed (RFC 5545), served at
 * GET /api/calendar.ics: one all-day event per planned evening. Pure and
 * unit-tested (tests/calendarFeed.test.ts).
 */

export const CALENDAR_DAYS_BACK = 14
export const CALENDAR_DAYS_AHEAD = 42

const CRLF = '\r\n'
const MAX_OCTETS = 75

/** Escape a TEXT value: backslash, semicolon, comma and line breaks. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Fold a content line into chunks of at most 75 octets (UTF-8); continuation
 * lines start with one space. Never splits a multi-byte character.
 */
export function foldLine(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= MAX_OCTETS) return line
  const parts: string[] = []
  let current = ''
  let size = 0
  let limit = MAX_OCTETS
  for (const ch of line) {
    const bytes = Buffer.byteLength(ch, 'utf8')
    if (size + bytes > limit) {
      parts.push(current)
      current = ''
      size = 0
      limit = MAX_OCTETS - 1 // the leading space counts
    }
    current += ch
    size += bytes
  }
  parts.push(current)
  return parts.join(`${CRLF} `)
}

/** 2026-09-27 → 20260927 */
function icsDate(date: string): string {
  return date.replace(/-/g, '')
}

/** UTC timestamp, e.g. 20260927T101500Z */
export function icsTimestamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export type CalendarInput = {
  entries: PlanDisplayEntry[]
  /** Setting app_public_url ('' when unset). */
  appUrl: string
  /** Household time zone (X-WR-TIMEZONE). */
  timezone: string
  now: Date
}

export function buildCalendar({ entries, appUrl, timezone, now }: CalendarInput): string {
  const stamp = icsTimestamp(now)
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vommeal//Essensplan//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Vommeal',
    `X-WR-TIMEZONE:${escapeText(timezone)}`,
    'X-WR-CALDESC:Abendessen aus Vommeal',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]

  const byDate = entriesByDate([...entries].sort((a, b) => a.date.localeCompare(b.date)))
  for (const entry of Array.from(byDate.values())) {
    const summary = dishWithEmoji(entry)
    if (!summary) continue
    const link = recipeLink(appUrl, entry)
    const description = [
      entry.suggested_by?.trim() ? `Geplant von ${entry.suggested_by.trim()}` : '',
      link ? `Rezept: ${link}` : '',
    ].filter(Boolean).join('\n')

    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeText(`${entry.id}@vommeal`)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(entry.date)}`,
      `DTEND;VALUE=DATE:${icsDate(addDaysIso(entry.date, 1))}`,
      `SUMMARY:${escapeText(summary)}`,
    )
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`)
    if (link) lines.push(`URL:${link}`)
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join(CRLF) + CRLF
}

/** First and last date of the feed around `today`. */
export function calendarRange(today: string): { start: string; end: string } {
  return { start: addDaysIso(today, -CALENDAR_DAYS_BACK), end: addDaysIso(today, CALENDAR_DAYS_AHEAD) }
}
