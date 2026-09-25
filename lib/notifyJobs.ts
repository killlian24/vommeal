import { getAllRecipes, getMealPlanRange, getSetting } from './db'
import type { MealPlanEntry } from './db'
import { getSettingWithDefault } from './config'
import type { DefaultedSettingKey } from './config'
import type { Recipient } from './notify'
import { dailyEmptyNotification, dailyPlannedNotification, weeklyNotification } from './notifyContent'
import type { NotifyMessage } from './notifyContent'
import { NOTIFY_TEXT_KEYS, templateFor } from './notifyTemplates'
import type { NotifyKind } from './notifyTemplates'
import { addDaysIso, inDinnerCategory, pickSuggestions } from './suggest'

/**
 * Builds the reminder notifications from the database: used by the
 * scheduler (lib/scheduler.ts) and the test button (POST /api/ha/notify-test).
 */

export type Builder = (r: Recipient) => NotifyMessage

const HISTORY_DAYS = 30

export function savedTemplate(kind: NotifyKind): string {
  return templateFor(kind, getSettingWithDefault(NOTIFY_TEXT_KEYS[kind] as DefaultedSettingKey))
}

export function plannedDish(entry: Pick<MealPlanEntry, 'custom_meal_name' | 'recipe'> | null | undefined): string {
  return entry?.recipe?.name?.trim() || entry?.custom_meal_name?.trim() || ''
}

/** One suggestion for `date`, by the same rules as the /tonight page (lib/suggest.ts). */
export function suggestionFor(date: string, random: () => number = Math.random): { id: string; name: string } | null {
  const recipes = inDinnerCategory(getAllRecipes(), getSetting('dinner_category') || '')
  const entries = getMealPlanRange(addDaysIso(date, -HISTORY_DAYS), addDaysIso(date, 3))
  const [pick] = pickSuggestions(recipes, entries, { today: date, count: 1, random })
  return pick ? { id: pick.id, name: pick.name } : null
}

type Opts = { test?: boolean; random?: () => number }

/** Daily reminder for `date`: the planned dish, or a suggestion with buttons. */
export function dailyBuilder(date: string, opts: Opts = {}): { kind: NotifyKind; build: Builder } {
  const dish = plannedDish(getMealPlanRange(date, date)[0])
  if (dish) return plannedBuilder(dish)
  return emptyBuilder(date, opts)
}

export function plannedBuilder(gericht: string): { kind: NotifyKind; build: Builder } {
  const template = savedTemplate('daily_planned')
  return { kind: 'daily_planned', build: r => dailyPlannedNotification({ template, name: r.name, gericht }) }
}

export function emptyBuilder(date: string, opts: Opts = {}): { kind: NotifyKind; build: Builder } {
  const template = savedTemplate('daily_empty')
  const appUrl = getSettingWithDefault('app_public_url')
  const suggestion = suggestionFor(date, opts.random)
  return {
    kind: 'daily_empty',
    build: r => dailyEmptyNotification({ template, name: r.name, deviceKey: r.key, appUrl, date, suggestion, test: opts.test }),
  }
}

/** Empty evenings in the week starting `monday`. */
export function emptyEvenings(monday: string): number {
  const dates = Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i))
  const planned = new Set(getMealPlanRange(dates[0], dates[6]).map(e => e.date))
  return dates.filter(d => !planned.has(d)).length
}

export function weeklyBuilder(monday: string, anzahl: number, opts: Opts = {}): { kind: NotifyKind; build: Builder } {
  const template = savedTemplate('weekly')
  const appUrl = getSettingWithDefault('app_public_url')
  return {
    kind: 'weekly',
    build: r => weeklyNotification({ template, name: r.name, deviceKey: r.key, appUrl, anzahl, monday, test: opts.test }),
  }
}
