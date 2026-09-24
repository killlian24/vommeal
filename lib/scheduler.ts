import { getMealPlanRange, getSetting, setSetting } from './db'
import type { MealPlanEntry } from './db'
import { getNotifyServices, getSettingWithDefault, getTimezone, zonedParts } from './config'
import type { ZonedParts } from './config'
import { isMealieConfigured } from './mealie'

/**
 * In-process scheduler, started from instrumentation.ts.
 *
 * Ticks every minute and runs time-based jobs in the household time zone
 * (setting `timezone`, not the server's local zone). Every job remembers the
 * day it last ran in a settings key, so restarts and repeated ticks never
 * run a job twice on the same day.
 *
 * Only active when NODE_ENV === 'production' or VOMMEAL_SCHEDULER === '1',
 * so dev servers never send notifications. VOMMEAL_SCHEDULER === '0' turns
 * it off in production too.
 *
 * Daily backups keep their own timer (lib/backup.ts, scheduleBackups).
 */

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in tests/scheduler.test.ts)
// ---------------------------------------------------------------------------

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * True when a job scheduled at `time` (HH:MM, optionally only on `weekday`,
 * 0 = Sunday) should run now: the time has been reached today, it has not
 * run today, and we are at most `windowMinutes` late (so a server that was
 * down at the time catches up, but not with stale messages hours later).
 */
export function isDue(
  now: ZonedParts,
  opts: { time: string; weekday?: number; lastRun: string | null; windowMinutes?: number },
): boolean {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(opts.time)) return false
  if (opts.weekday !== undefined && now.weekday !== opts.weekday) return false
  if (opts.lastRun === now.date) return false
  const late = toMinutes(now.time) - toMinutes(opts.time)
  return late >= 0 && late <= (opts.windowMinutes ?? 180)
}

function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** Monday–Sunday of the week after the one containing `today` (weekday: 0 = Sunday). */
export function nextWeekDates(today: string, weekday: number): string[] {
  const daysToNextMonday = ((8 - weekday) % 7) || 7
  const monday = addDaysIso(today, daysToNextMonday)
  return Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i))
}

export function countEmptyEvenings(dates: string[], plannedDates: Iterable<string>): number {
  const planned = new Set(plannedDates)
  return dates.filter(d => !planned.has(d)).length
}

/** Weekly reminder text, or null when nothing is left to plan. */
export function weeklyReminderMessage(emptyEvenings: number): string | null {
  if (emptyEvenings <= 0) return null
  if (emptyEvenings === 1) return 'Nächste Woche ist noch 1 Abend frei – kurz planen?'
  return `Nächste Woche sind noch ${emptyEvenings} Abende frei – kurz planen?`
}

export function dailyMessage(entry: Pick<MealPlanEntry, 'custom_meal_name' | 'recipe'> | null | undefined): string {
  const dish = entry?.recipe?.name?.trim() || entry?.custom_meal_name?.trim()
  return dish ? `Heute: ${dish}` : 'Heute ist noch nichts geplant'
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const NIGHTLY_SYNC_TIME = '03:30'

type Job = {
  name: string
  lastRunKey: string
  /** Returns true when the job should run now. */
  due: (now: ZonedParts, lastRun: string | null) => boolean
  run: (now: ZonedParts) => Promise<void>
}

async function notify(message: string, path: string, tag: string) {
  const { notifyConfigured } = await import('./notify')
  const result = await notifyConfigured(message, path, tag)
  if (result.errors.length) console.error(`[scheduler] ${tag}: ${result.errors.join('; ')}`)
  else console.log(`[scheduler] ${tag}: sent to ${result.sent} device(s)`)
}

function hasNotifyServices(): boolean {
  return getNotifyServices().length > 0
}

const JOBS: Job[] = [
  {
    name: 'weekly reminder',
    lastRunKey: 'last_notify_weekly',
    due: (now, lastRun) =>
      getSettingWithDefault('notify_weekly_enabled') === '1' && hasNotifyServices() &&
      isDue(now, {
        time: getSettingWithDefault('notify_weekly_time'),
        weekday: Number(getSettingWithDefault('notify_weekly_day')),
        lastRun,
      }),
    run: async now => {
      const dates = nextWeekDates(now.date, now.weekday)
      const planned = getMealPlanRange(dates[0], dates[6]).map(e => e.date)
      const message = weeklyReminderMessage(countEmptyEvenings(dates, planned))
      if (!message) {
        console.log('[scheduler] weekly reminder: next week is fully planned, skipped')
        return
      }
      await notify(message, '/?week=next', 'vommeal-weekly')
    },
  },
  {
    name: 'daily reminder',
    lastRunKey: 'last_notify_daily',
    due: (now, lastRun) =>
      getSettingWithDefault('notify_daily_enabled') === '1' && hasNotifyServices() &&
      isDue(now, { time: getSettingWithDefault('notify_daily_time'), lastRun }),
    run: async now => {
      const entry = getMealPlanRange(now.date, now.date)[0]
      await notify(dailyMessage(entry), '/tonight', 'vommeal-daily')
    },
  },
  {
    name: 'nightly Mealie sync',
    lastRunKey: 'last_mealie_nightly_sync',
    due: (now, lastRun) =>
      getSettingWithDefault('mealie_nightly_sync') === '1' && isMealieConfigured() &&
      isDue(now, { time: NIGHTLY_SYNC_TIME, lastRun, windowMinutes: 12 * 60 }),
    run: async () => {
      const { syncMealieRecipes } = await import('./mealieSync')
      const r = await syncMealieRecipes()
      console.log(`[scheduler] Mealie sync: ${r.total} recipes, ${r.created} new, ${r.synced} updated, ${r.errors} errors`)
    },
  },
]

const runningJobs = new Set<string>()

/** Run all due jobs once. Exported for manual triggering / tests. */
export async function tick(date = new Date()) {
  const now = zonedParts(date, getTimezone())
  for (const job of JOBS) {
    if (runningJobs.has(job.name)) continue
    let due = false
    try {
      due = job.due(now, getSetting(job.lastRunKey))
    } catch (e) {
      console.error(`[scheduler] ${job.name}: ${String(e)}`)
    }
    if (!due) continue

    // Mark first: a failing job is not retried every minute, and a crash
    // mid-send never leads to duplicate notifications.
    setSetting(job.lastRunKey, now.date)
    runningJobs.add(job.name)
    job.run(now)
      .catch(e => console.error(`[scheduler] ${job.name} failed: ${String(e)}`))
      .finally(() => runningJobs.delete(job.name))
  }
}

export function schedulerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.VOMMEAL_SCHEDULER === '0') return false
  return env.NODE_ENV === 'production' || env.VOMMEAL_SCHEDULER === '1'
}

const TICK_MS = 60 * 1000
const FIRST_TICK_MS = 15 * 1000
const globalState = globalThis as typeof globalThis & { __vommealScheduler?: boolean }

/** Start the minute ticker (no-op in dev unless VOMMEAL_SCHEDULER=1; safe to call twice). */
export function startScheduler() {
  if (globalState.__vommealScheduler) return
  if (!schedulerEnabled()) {
    console.log('[scheduler] disabled (set VOMMEAL_SCHEDULER=1 to enable outside production)')
    return
  }
  globalState.__vommealScheduler = true
  const safeTick = () => { tick().catch(e => console.error(`[scheduler] tick failed: ${String(e)}`)) }
  setTimeout(safeTick, FIRST_TICK_MS).unref()
  setInterval(safeTick, TICK_MS).unref()
  console.log(`[scheduler] started (time zone ${getTimezone()})`)
}
