import { createHash } from 'crypto'
import { getMealPlanRange, onMealPlanChange } from './db'
import { getHomeAssistantConnection, getSettingWithDefault, todayInTimezone } from './config'
import {
  WEEKDAYS_LONG, WEEKDAYS_SHORT, addDaysIso, dishName, entriesByDate, entryEmoji,
  mondayOf, recipeImageLink, recipeLink, shortGermanDate, weekdayOf,
} from './planDisplay'
import type { PlanDisplayEntry } from './planDisplay'
import { SENSOR_IDS } from './haDashboardCard'

/**
 * The week's dinners as Home Assistant sensors.
 *
 * Vommeal writes three entities through HA's REST API
 * (`POST /api/states/<entity_id>`), so nothing has to be configured in HA:
 *
 *   sensor.vommeal_heute   state = tonight's dish ("Nichts geplant" when free)
 *   sensor.vommeal_morgen  state = tomorrow's dish
 *   sensor.vommeal_woche   state = "5/7", attributes with every day and a
 *                          ready-made markdown text for a markdown card
 *
 * HA forgets states created this way when it restarts, so the scheduler
 * (lib/scheduler.ts) pushes whenever something visible changed and at least
 * every PUSH_INTERVAL_MS anyway. Plan changes (lib/db.ts, onMealPlanChange)
 * trigger a debounced push right away.
 *
 * The builders at the top are pure and unit-tested (tests/haDashboard.test.ts).
 */

export { SENSOR_IDS }

export const NOTHING_PLANNED = 'Nichts geplant'
/** HA rejects states longer than 255 characters. */
export const STATE_MAX = 255
export const PUSH_INTERVAL_MS = 30 * 60 * 1000
export const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000
export const DEBOUNCE_MS = 2000
const REQUEST_TIMEOUT_MS = 10000

const ICON_DAY = 'mdi:silverware-fork-knife'
const ICON_WEEK = 'mdi:calendar-week'

export type SensorPayload = { entity_id: string; state: string; attributes: Record<string, unknown> }

export type DashboardInput = {
  /** Today (YYYY-MM-DD) in the household time zone. */
  today: string
  /** Planned evenings, at least Monday of this week … Sunday of next week. */
  entries: PlanDisplayEntry[]
  /** Setting app_public_url ('' when unset). */
  appUrl: string
}

export type DayInfo = {
  datum: string
  tag: string
  gericht: string | null
  von: string | null
  bild: string | null
  heute: boolean
  vorbei: boolean
}

// ---------------------------------------------------------------------------
// Pure builders
// ---------------------------------------------------------------------------

/** Cut to at most `max` characters (code points, like HA counts them), ending in "…". */
export function truncateState(value: string, max = STATE_MAX): string {
  const chars = Array.from(value)
  if (chars.length <= max) return value
  return chars.slice(0, max - 1).join('').trimEnd() + '…'
}

/** Backslash-escape characters that would change the markdown rendering of a dish name. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]~<>|]/g, '\\$&').replace(/\s+/g, ' ')
}

function markdownUrl(url: string): string {
  return url.replace(/[()\s]/g, c => encodeURIComponent(c))
}

function dayInfo(date: string, entry: PlanDisplayEntry | undefined, today: string, appUrl: string): DayInfo {
  return {
    datum: date,
    tag: WEEKDAYS_SHORT[weekdayOf(date)],
    gericht: dishName(entry) || null,
    von: entry?.suggested_by?.trim() || null,
    bild: recipeImageLink(appUrl, entry),
    heute: date === today,
    vorbei: date < today,
  }
}

function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i))
}

/**
 * Markdown for a HA markdown card, one line per day:
 *   ~~Mo 22.9. Linsen~~          (past)
 *   👉 **Sa 27.9. Linsen**        (today)
 *   **So 28.9.** 🍽️ Auswärts essen
 *   **Mo 29.9.** —               (nothing planned)
 * Dish names link to the recipe when the app address is known.
 * Lines end in two spaces (a markdown line break).
 */
export function renderWeekMarkdown(dates: string[], byDate: Map<string, PlanDisplayEntry>, today: string, appUrl: string): string {
  return dates.map(date => {
    const entry = byDate.get(date)
    const label = `${WEEKDAYS_SHORT[weekdayOf(date)]} ${shortGermanDate(date)}`
    const name = dishName(entry)
    let dish = '—'
    if (name) {
      const link = recipeLink(appUrl, entry)
      const text = escapeMarkdown(name)
      const emoji = entryEmoji(entry)
      dish = `${emoji ? `${emoji} ` : ''}${link ? `[${text}](${markdownUrl(link)})` : text}`
    }
    if (date < today) return `~~${label} ${dish}~~`
    if (date === today) return `👉 **${label} ${dish}**`
    return `**${label}** ${dish}`
  }).join('  \n')
}

function daySensor(entityId: string, friendlyName: string, date: string, entry: PlanDisplayEntry | undefined, appUrl: string): SensorPayload {
  const attributes: Record<string, unknown> = {
    friendly_name: friendlyName,
    icon: ICON_DAY,
    datum: date,
    wochentag: WEEKDAYS_LONG[weekdayOf(date)],
    geplant_von: entry?.suggested_by?.trim() || null,
  }
  const link = recipeLink(appUrl, entry)
  if (link) attributes.rezept_url = link
  const picture = recipeImageLink(appUrl, entry)
  if (picture) attributes.entity_picture = picture
  return { entity_id: entityId, state: truncateState(dishName(entry) || NOTHING_PLANNED), attributes }
}

/** The three sensors for `today`. */
export function buildDashboard({ today, entries, appUrl }: DashboardInput): SensorPayload[] {
  const byDate = entriesByDate(entries)
  const tomorrow = addDaysIso(today, 1)
  const thisWeek = weekDates(mondayOf(today))
  const nextWeek = weekDates(addDaysIso(thisWeek[0], 7))

  const planned = thisWeek.filter(d => dishName(byDate.get(d))).length
  const free = thisWeek.filter(d => d >= today && !dishName(byDate.get(d))).length

  return [
    daySensor(SENSOR_IDS.heute, 'Vommeal Heute', today, byDate.get(today), appUrl),
    daySensor(SENSOR_IDS.morgen, 'Vommeal Morgen', tomorrow, byDate.get(tomorrow), appUrl),
    {
      entity_id: SENSOR_IDS.woche,
      state: `${planned}/7`,
      attributes: {
        friendly_name: 'Vommeal Woche',
        icon: ICON_WEEK,
        frei: free,
        tage: thisWeek.map(d => dayInfo(d, byDate.get(d), today, appUrl)),
        naechste_woche: nextWeek.map(d => dayInfo(d, byDate.get(d), today, appUrl)),
        markdown: renderWeekMarkdown(thisWeek, byDate, today, appUrl),
        markdown_naechste_woche: renderWeekMarkdown(nextWeek, byDate, today, appUrl),
      },
    },
  ]
}

/**
 * Fingerprint of what HA would show. Built from the finished payloads, so it
 * covers today's date, every dish, image and person of both weeks and the
 * app address (links/pictures); `target` (the HA address) makes a changed
 * HA address count as a change too.
 */
export function dashboardFingerprint(payloads: SensorPayload[], target = ''): string {
  return createHash('sha1').update(JSON.stringify([target, payloads])).digest('hex')
}

export type PushState = { fingerprint: string | null; pushedAt: number | null; failedAt: number | null }

/** Push when something changed or the last push is PUSH_INTERVAL_MS old; wait a bit after a failure. */
export function shouldPush(fingerprint: string, state: PushState, nowMs: number): boolean {
  if (state.failedAt !== null && nowMs - state.failedAt < RETRY_AFTER_FAILURE_MS) return false
  if (fingerprint !== state.fingerprint) return true
  return state.pushedAt === null || nowMs - state.pushedAt >= PUSH_INTERVAL_MS
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export type HaConnection = { baseUrl: string; token: string }
type FetchFn = typeof fetch

/** Write every sensor via POST /api/states/<entity_id>. Throws on the first failure. */
export async function pushSensors(conn: HaConnection, payloads: SensorPayload[], fetchImpl: FetchFn = fetch): Promise<void> {
  for (const p of payloads) {
    let res: Response
    try {
      res = await fetchImpl(`${conn.baseUrl}/api/states/${p.entity_id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: p.state, attributes: p.attributes }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (e) {
      const cause = e instanceof Error && e.cause instanceof Error ? ` (${e.cause.message})` : ''
      throw new Error(`${p.entity_id}: ${e instanceof Error ? e.message : String(e)}${cause}`)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const hint = res.status === 401 ? ' – Token ungültig?' : ''
      throw new Error(`${p.entity_id}: HA antwortet ${res.status}${hint} ${text.slice(0, 200)}`.trim())
    }
  }
}

// ---------------------------------------------------------------------------
// DB-backed push with shared state
// ---------------------------------------------------------------------------

/** The sensors as they should look now, from the database. */
export function collectDashboard(now = new Date()): SensorPayload[] {
  const today = todayInTimezone(now)
  const monday = mondayOf(today)
  return buildDashboard({
    today,
    entries: getMealPlanRange(monday, addDaysIso(monday, 13)),
    appUrl: getSettingWithDefault('app_public_url'),
  })
}

export function dashboardEnabled(): boolean {
  return getSettingWithDefault('ha_dashboard_enabled') !== '0'
}

type SharedState = PushState & {
  inflight: Promise<unknown> | null
  timer: ReturnType<typeof setTimeout> | null
  /** Set by startDashboardSync (scheduler running): only then do plan changes push. */
  active: boolean
  unsubscribe: (() => void) | null
}

// Route handlers, the scheduler and instrumentation may load separate module
// instances; keep one state per process.
const shared = globalThis as typeof globalThis & { __vommealHaDashboard?: SharedState }
function state(): SharedState {
  shared.__vommealHaDashboard ??= { fingerprint: null, pushedAt: null, failedAt: null, inflight: null, timer: null, active: false, unsubscribe: null }
  return shared.__vommealHaDashboard
}

export type PushResult = {
  ok: boolean
  pushed: boolean
  /** Why nothing was sent: switched off, or HA address/token missing. */
  skipped?: 'disabled' | 'unconfigured'
  error?: string
}

/**
 * Push the sensors if needed (or always with `force`). Never throws; logs one
 * line per push or failure. Pushes run one after another.
 */
export async function pushDashboardNow(opts: { force?: boolean; now?: Date; fetchImpl?: FetchFn } = {}): Promise<PushResult> {
  const s = state()
  while (s.inflight) await s.inflight.catch(() => {})
  const run = (async (): Promise<PushResult> => {
    if (!dashboardEnabled()) {
      s.fingerprint = null // switched on again later: push right away
      return { ok: false, pushed: false, skipped: 'disabled', error: 'Das Senden an Home Assistant ist ausgeschaltet.' }
    }
    const conn = getHomeAssistantConnection()
    if (!conn) return { ok: false, pushed: false, skipped: 'unconfigured', error: 'Home Assistant ist nicht eingerichtet (Adresse und Token fehlen).' }

    const now = opts.now ?? new Date()
    const nowMs = now.getTime()
    let payloads: SensorPayload[]
    try {
      payloads = collectDashboard(now)
    } catch (e) {
      console.error(`[ha-dashboard] could not read the plan: ${String(e)}`)
      return { ok: false, pushed: false, error: 'Der Plan konnte nicht gelesen werden.' }
    }
    const fingerprint = dashboardFingerprint(payloads, conn.baseUrl)
    if (!opts.force && !shouldPush(fingerprint, s, nowMs)) return { ok: true, pushed: false }

    try {
      await pushSensors(conn, payloads, opts.fetchImpl)
      s.fingerprint = fingerprint
      s.pushedAt = nowMs
      s.failedAt = null
      const [heute, , woche] = payloads
      console.log(`[ha-dashboard] sent ${payloads.length} sensors (heute: ${heute.state}, woche: ${woche.state})`)
      return { ok: true, pushed: true }
    } catch (e) {
      s.failedAt = nowMs
      const message = e instanceof Error ? e.message : String(e)
      console.error(`[ha-dashboard] push failed: ${message}`)
      return { ok: false, pushed: false, error: message }
    }
  })()
  s.inflight = run
  try {
    return await run
  } finally {
    if (s.inflight === run) s.inflight = null
  }
}

/** Scheduler hook (every minute): push when needed. Never throws. */
export async function dashboardTick(now = new Date()): Promise<void> {
  try {
    await pushDashboardNow({ now })
  } catch (e) {
    console.error(`[ha-dashboard] tick failed: ${String(e)}`)
  }
}

/**
 * Push soon (debounced) after the plan changed. Only does something while
 * the scheduler runs (startDashboardSync), so dev servers never write to HA.
 */
export function requestDashboardPush(delayMs = DEBOUNCE_MS): void {
  const s = state()
  if (!s.active) return
  if (s.timer) clearTimeout(s.timer)
  s.timer = setTimeout(() => {
    s.timer = null
    void pushDashboardNow()
  }, delayMs)
  s.timer.unref?.()
}

/** Called by the scheduler on start: plan changes now trigger a push. Safe to call twice. */
export function startDashboardSync(): void {
  const s = state()
  if (s.active) return
  s.active = true
  s.unsubscribe = onMealPlanChange(() => requestDashboardPush())
}

/** For tests: forget pushes, timers and listeners. */
export function resetDashboardState(): void {
  const s = state()
  if (s.timer) clearTimeout(s.timer)
  s.unsubscribe?.()
  shared.__vommealHaDashboard = undefined
}
