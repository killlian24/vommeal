import { renderNotifyText } from './notifyTemplates'

/**
 * What the notifications say and which buttons they carry. Pure (no DB, no
 * network), unit-tested in tests/notifyContent.test.ts.
 *
 * Buttons use the Home Assistant companion app's actionable notifications
 * (`data.actions`). URL buttons are `{action: 'URI', title, uri}`. Buttons
 * that should do something in Vommeal carry an action id
 *
 *   VOMMEAL|<verb>|<args, comma-separated>|<deviceKey>
 *
 * e.g. `VOMMEAL|plan|2026-09-25,0d0e7c74-…|1x9k2mq`. HA fires the event
 * `mobile_app_notification_action` with `data.action` = that id when the
 * button is tapped; lib/haEvents.ts listens for it and lib/notifyActions.ts
 * acts on it. `deviceKey` is a short hash of the notify service the message
 * was sent to, so we know which phone (and person) tapped.
 */

export const ACTION_PREFIX = 'VOMMEAL'

export const NOTIFY_TAGS = {
  daily: 'vommeal-daily',
  weekly: 'vommeal-weekly',
  test: 'vommeal-test',
} as const

/** Longest button title we send (Android shows up to 3 buttons, iOS truncates long ones). */
export const BUTTON_TITLE_MAX = 24

export type NotifyButton = { action: string; title: string; uri?: string }
/** One message for one device; `path` is the in-app link for tapping the notification body. */
export type NotifyMessage = { message: string; path: string; actions: NotifyButton[] }

export type ActionVerb = 'plan' | 'leftovers' | 'fillweek' | 'test'

export type ParsedAction =
  | { verb: 'plan'; date: string; recipeId: string; deviceKey: string }
  | { verb: 'leftovers'; date: string; deviceKey: string }
  | { verb: 'fillweek'; monday: string; deviceKey: string }
  | { verb: 'test'; original: string; deviceKey: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const KEY_RE = /^[a-z0-9]{1,12}$/
const MAX_ACTION_LENGTH = 200

// ---------------------------------------------------------------------------
// Device keys and action ids
// ---------------------------------------------------------------------------

/** Short, stable key for a notify service (32-bit FNV-1a, base 36). */
export function deviceKey(service: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < service.length; i++) {
    h ^= service.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

export function formatAction(verb: ActionVerb, args: string[], key: string): string {
  return [ACTION_PREFIX, verb, args.join(','), key].join('|')
}

/** Parse an action id from a HA event; null for anything that is not a valid Vommeal action. */
export function parseAction(raw: unknown): ParsedAction | null {
  if (typeof raw !== 'string' || raw.length > MAX_ACTION_LENGTH) return null
  const parts = raw.split('|')
  if (parts.length !== 4 || parts[0] !== ACTION_PREFIX) return null
  const [, verb, argString, key] = parts
  if (!KEY_RE.test(key)) return null
  const args = argString === '' ? [] : argString.split(',')
  switch (verb) {
    case 'plan':
      if (args.length !== 2 || !DATE_RE.test(args[0]) || !ID_RE.test(args[1])) return null
      return { verb, date: args[0], recipeId: args[1], deviceKey: key }
    case 'leftovers':
      if (args.length !== 1 || !DATE_RE.test(args[0])) return null
      return { verb, date: args[0], deviceKey: key }
    case 'fillweek':
      if (args.length !== 1 || !DATE_RE.test(args[0])) return null
      return { verb, monday: args[0], deviceKey: key }
    case 'test':
      if (args.length > 1 || (args[0] !== undefined && !/^[a-z]{1,20}$/.test(args[0]))) return null
      return { verb, original: args[0] ?? '', deviceKey: key }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/** Cut `text` to `max` characters (code points), ending in "…" when shortened. */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text.trim().replace(/\s+/g, ' '))
  if (chars.length <= max) return chars.join('')
  return chars.slice(0, Math.max(1, max - 1)).join('').replace(/[\s,.;:–-]+$/, '') + '…'
}

/** "<Rezept> kochen", with the recipe name shortened so the title fits BUTTON_TITLE_MAX. */
export function cookButtonTitle(recipeName: string, max = BUTTON_TITLE_MAX): string {
  const suffix = ' kochen'
  return `${truncate(recipeName, max - suffix.length)}${suffix}`
}

/** Absolute app link, or '' without an app address (the button is then left out). */
export function joinAppUrl(appUrl: string, path: string): string {
  const base = (appUrl || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

function actionButton(verb: Exclude<ActionVerb, 'test'>, args: string[], title: string, key: string, test: boolean): NotifyButton {
  return test
    ? { action: formatAction('test', [verb], key), title }
    : { action: formatAction(verb, args, key), title }
}

function uriButton(title: string, appUrl: string, path: string): NotifyButton[] {
  const uri = joinAppUrl(appUrl, path)
  return uri ? [{ action: 'URI', title, uri }] : []
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

type Common = {
  template: string
  /** Person of the device ('' when none is assigned). */
  name: string
  deviceKey: string
  /** app_public_url (already normalized), '' when not set. */
  appUrl: string
  /** Test notification: buttons use verb 'test' and change nothing. */
  test?: boolean
}

/** Daily reminder when something is planned: text only. */
export function dailyPlannedNotification(opts: { template: string; name: string; gericht: string }): NotifyMessage {
  return {
    message: renderNotifyText(opts.template, { name: opts.name, gericht: opts.gericht }),
    path: '/tonight',
    actions: [],
  }
}

/**
 * Daily reminder when nothing is planned: one suggestion plus buttons
 * "<Rezept> kochen", "Reste", "Andere Ideen". Without a suggestion the text
 * drops the suggestion sentence and only "Reste" + "Andere Ideen" remain.
 */
export function dailyEmptyNotification(opts: Common & {
  date: string
  suggestion: { id: string; name: string } | null
}): NotifyMessage {
  const { suggestion, test = false } = opts
  const usable = suggestion && ID_RE.test(suggestion.id) ? suggestion : null
  const actions: NotifyButton[] = []
  if (usable) actions.push(actionButton('plan', [opts.date, usable.id], cookButtonTitle(usable.name), opts.deviceKey, test))
  actions.push(actionButton('leftovers', [opts.date], 'Reste', opts.deviceKey, test))
  actions.push(...uriButton('Andere Ideen', opts.appUrl, '/tonight'))
  return {
    message: renderNotifyText(opts.template, { name: opts.name, vorschlag: usable?.name ?? '' }),
    path: '/tonight',
    actions,
  }
}

/** Weekly reminder: "Woche füllen" (autofill next week) and "Selbst planen" (open next week). */
export function weeklyNotification(opts: Common & { anzahl: number; monday: string }): NotifyMessage {
  const test = opts.test ?? false
  return {
    message: renderNotifyText(opts.template, { name: opts.name, anzahl: opts.anzahl }),
    path: '/?week=next',
    actions: [
      actionButton('fillweek', [opts.monday], 'Woche füllen', opts.deviceKey, test),
      ...uriButton('Selbst planen', opts.appUrl, '/?week=next'),
    ],
  }
}

// ---------------------------------------------------------------------------
// Answers after a button tap
// ---------------------------------------------------------------------------

/** "heute", "morgen" or "am 27.09." relative to `today`. */
export function dayWord(date: string, today: string): string {
  if (date === today) return 'heute'
  const [y, m, d] = today.split('-').map(Number)
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  if (date === tomorrow) return 'morgen'
  return `am ${date.slice(8, 10)}.${date.slice(5, 7)}.`
}

export const TEST_REPLY = '✓ Der Knopf funktioniert'

export function evenings(n: number): string {
  return n === 1 ? '1 Abend' : `${n} Abende`
}
