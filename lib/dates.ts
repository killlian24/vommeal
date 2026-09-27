// One way to write a day across the app (Woche, Heute, Verschieben,
// Zutaten der Woche): "Heute", "Morgen", otherwise "Mi 30.9.". Pure and
// client-safe; dates are calendar dates (YYYY-MM-DD), no time zone involved.
// Unit-tested in tests/dates.test.ts.

const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const WEEKDAYS_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.']

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m, d]
}

function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function weekday(date: string): number {
  const [y, m, d] = parts(date)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Today on this device as YYYY-MM-DD (local time). */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** "Mi 30.9." */
export function shortDay(date: string): string {
  const [, m, d] = parts(date)
  return `${WEEKDAYS_SHORT[weekday(date)]} ${d}.${m}.`
}

/** "Heute", "Morgen", otherwise "Mi 30.9." */
export function dayLabel(date: string, today = todayIso()): string {
  if (date === today) return 'Heute'
  if (date === addDays(today, 1)) return 'Morgen'
  return shortDay(date)
}

/** "Mittwoch" */
export function weekdayName(date: string): string {
  return WEEKDAYS_LONG[weekday(date)]
}

/** "Heute", "Morgen", otherwise "Mittwoch" (for titles like "Anderes Gericht für Mittwoch"). */
export function relativeWeekday(date: string, today = todayIso()): string {
  if (date === today) return 'Heute'
  if (date === addDays(today, 1)) return 'Morgen'
  return weekdayName(date)
}

/** "28. Sep." */
export function dayMonth(date: string): string {
  const [, m, d] = parts(date)
  return `${d}. ${MONTHS_SHORT[m - 1]}`
}

/** "28. bis 4. Okt." within a month "22. bis 28. Sep.", across months "28. Sep. bis 4. Okt." */
export function rangeLabel(start: string, end: string): string {
  const [, sm, sd] = parts(start)
  const [, em] = parts(end)
  return sm === em ? `${sd}. bis ${dayMonth(end)}` : `${dayMonth(start)} bis ${dayMonth(end)}`
}
