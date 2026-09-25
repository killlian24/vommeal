import { randomUUID } from 'crypto'
import { addMealPlanEntry, getMealPlanRange, getRecipeById } from './db'
import { getSettingWithDefault, todayInTimezone } from './config'
import { appLink, buildNotifyPayload, getRecipients, sendPayloads } from './notify'
import type { NotifyPayload, NotifyResult, Recipient } from './notify'
import { NOTIFY_TAGS, TEST_REPLY, dayWord, deviceKey, evenings, parseAction } from './notifyContent'
import type { ParsedAction } from './notifyContent'
import { autofillRange } from './autofill'
import type { AutofillResult } from './autofill'
import { addDaysIso } from './suggest'
import { trackServer } from './serverEvents'

/**
 * What happens when someone taps a button on a Vommeal notification
 * (see lib/notifyContent.ts for the action ids, lib/haEvents.ts for how the
 * tap reaches us). Pure decisions first, the thin IO part at the bottom.
 */

export const LEFTOVERS = 'Reste'

// ---------------------------------------------------------------------------
// Pure decisions (tests/notifyActions.test.ts)
// ---------------------------------------------------------------------------

export type DayEntry = {
  recipe_id: string | null
  custom_meal_name: string | null
  recipeName?: string | null
  suggested_by?: string
}

export type DayDecision = {
  outcome: 'planned' | 'same' | 'already' | 'expired' | 'missing_recipe'
  /** Plan entry to create, or null to change nothing. */
  write: { date: string; recipe_id: string | null; custom_meal_name: string | null } | null
  /** Answer for the device that tapped. */
  reply: string
  /** Short info for the other person's devices, or null. */
  info: string | null
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * "plan" / "leftovers": plan the dish for the day of the notification if that
 * day is still empty. A day that is already planned is never overwritten.
 */
export function decideDayAction(
  action: Extract<ParsedAction, { verb: 'plan' | 'leftovers' }>,
  state: { today: string; existing: DayEntry | null; recipe: { id: string; name: string } | null },
  person: string,
): DayDecision {
  const { today, existing, recipe } = state
  if (action.date < today) {
    return { outcome: 'expired', write: null, reply: 'Diese Erinnerung ist abgelaufen – bitte in Vommeal planen', info: null }
  }
  const day = dayWord(action.date, today)
  if (action.verb === 'plan' && !recipe) {
    return { outcome: 'missing_recipe', write: null, reply: 'Das Rezept gibt es nicht mehr – bitte in Vommeal planen', info: null }
  }
  const isLeftovers = action.verb === 'leftovers'
  const dish = isLeftovers ? LEFTOVERS : recipe!.name
  const success = isLeftovers ? `✓ ${LEFTOVERS} für ${day} eingetragen` : `✓ ${dish} ist für ${day} geplant`

  if (existing) {
    const same = isLeftovers
      ? !existing.recipe_id && existing.custom_meal_name === LEFTOVERS
      : existing.recipe_id === recipe!.id
    // Tapped twice, or both tapped the same button: the result is what they wanted.
    if (same) return { outcome: 'same', write: null, reply: success, info: null }
    const planned = existing.recipeName?.trim() || existing.custom_meal_name?.trim() || 'etwas'
    const by = existing.suggested_by?.trim()
    const suffix = by && by !== person && by !== 'Vommeal' ? ` (von ${by})` : ''
    return { outcome: 'already', write: null, reply: `${capitalize(day)} ist schon ${planned} geplant${suffix}`, info: null }
  }

  const info = person
    ? (isLeftovers ? `${person} hat ${LEFTOVERS} für ${day} eingetragen` : `${person} hat ${dish} für ${day} geplant`)
    : (isLeftovers ? `${LEFTOVERS} sind für ${day} eingetragen` : `${dish} ist jetzt für ${day} geplant`)
  return {
    outcome: 'planned',
    write: {
      date: action.date,
      recipe_id: isLeftovers ? null : recipe!.id,
      custom_meal_name: isLeftovers ? LEFTOVERS : null,
    },
    reply: success,
    info,
  }
}

/** Answers after "Woche füllen". */
export function fillWeekMessages(result: AutofillResult | 'expired', person: string): { reply: string; info: string | null } {
  if (result === 'expired') return { reply: 'Diese Woche ist schon vorbei', info: null }
  if (!result.ok) return { reply: `Woche füllen hat nicht geklappt: ${result.error}`, info: null }
  if (result.filled === 0) return { reply: '✓ Die Woche ist schon komplett geplant', info: null }
  return {
    reply: `✓ ${evenings(result.filled)} gefüllt`,
    info: person
      ? `${person} hat nächste Woche ${evenings(result.filled)} gefüllt`
      : `Nächste Woche wurden ${evenings(result.filled)} gefüllt`,
  }
}

/** Devices that get the short info: everyone except the tapping device and the tapping person's other phones. */
export function otherRecipients(all: Recipient[], tapper: Recipient | null, person: string): Recipient[] {
  return all.filter(r => r.service !== tapper?.service && (!person || r.name !== person))
}

// ---------------------------------------------------------------------------
// Duplicate events and test devices (process-wide state)
// ---------------------------------------------------------------------------

const DEDUPE_MS = 2 * 60 * 1000

type SharedState = { seen: Map<string, number>; testServices: Set<string> }
const shared = globalThis as typeof globalThis & { __vommealNotifyActions?: SharedState }
function state(): SharedState {
  shared.__vommealNotifyActions ??= { seen: new Map(), testServices: new Set() }
  return shared.__vommealNotifyActions
}

/** True when the same action id was already handled in the last 2 minutes (HA delivered it twice). */
export function isDuplicateAction(action: string, nowMs: number): boolean {
  const seen = state().seen
  for (const [k, t] of seen) if (nowMs - t > DEDUPE_MS) seen.delete(k)
  if (seen.has(action)) return true
  seen.set(action, nowMs)
  return false
}

export function resetActionState() {
  shared.__vommealNotifyActions = undefined
}

/** Test notifications may go to devices that are not saved yet; remember them so the test button can answer. */
export function rememberTestServices(services: string[]) {
  const set = state().testServices
  for (const s of services) set.add(s)
  while (set.size > 50) set.delete(set.values().next().value as string)
}

// ---------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------

type SendFn = (items: { service: string; payload: NotifyPayload }[]) => Promise<NotifyResult>

export type HandlerDeps = { now?: Date; send?: SendFn; random?: () => number }

export type HandlerResult = { handled: boolean; verb?: string; outcome?: string; reply?: string; info?: string | null }

/** Handle `data.action` of a mobile_app_notification_action event. Never throws. */
export async function handleNotificationAction(raw: unknown, deps: HandlerDeps = {}): Promise<HandlerResult> {
  try {
    return await handle(raw, deps)
  } catch (e) {
    console.error(`[notify-action] failed: ${String(e)}`)
    return { handled: false }
  }
}

async function handle(raw: unknown, deps: HandlerDeps): Promise<HandlerResult> {
  const now = deps.now ?? new Date()
  const send = deps.send ?? sendPayloads
  const action = parseAction(raw)
  if (!action) {
    console.warn(`[notify-action] ignored unknown action ${JSON.stringify(String(raw).slice(0, 80))}`)
    return { handled: false }
  }
  if (isDuplicateAction(raw as string, now.getTime())) return { handled: false, verb: action.verb, outcome: 'duplicate' }

  const recipients = getRecipients()
  let tapper = recipients.find(r => r.key === action.deviceKey) ?? null
  if (!tapper && action.verb === 'test') {
    const service = [...state().testServices].find(s => deviceKey(s) === action.deviceKey)
    if (service) tapper = getRecipients([service])[0]
  }
  const person = tapper?.name ?? ''
  const appUrl = getSettingWithDefault('app_public_url')
  const today = todayInTimezone(now)

  const message = (text: string, path: string, tag: string) => buildNotifyPayload(text, appLink(appUrl, path), tag)
  const deliver = async (reply: string, info: string | null, path: string, tag: string) => {
    const items: { service: string; payload: NotifyPayload }[] = []
    // Same tag as the original: the answer replaces the notification with the buttons.
    if (tapper) items.push({ service: tapper.service, payload: message(reply, path, tag) })
    if (info) {
      for (const r of otherRecipients(recipients, tapper, person)) items.push({ service: r.service, payload: message(info, path, tag) })
    }
    if (items.length === 0) return
    const result = await send(items)
    if (result.errors.length) console.error(`[notify-action] answer: ${result.errors.join('; ')}`)
  }

  let outcome: string
  let reply: string
  let info: string | null = null

  if (action.verb === 'test') {
    outcome = 'test'
    reply = TEST_REPLY
    await deliver(reply, null, '/', NOTIFY_TAGS.test)
  } else if (action.verb === 'fillweek') {
    const sunday = addDaysIso(action.monday, 6)
    const result = sunday < today ? 'expired' as const : autofillRange(action.monday, sunday, person || 'Vommeal', { today, random: deps.random })
    ;({ reply, info } = fillWeekMessages(result, person))
    outcome = result === 'expired' ? 'expired' : result.ok ? (result.filled > 0 ? 'filled' : 'already') : 'error'
    await deliver(reply, info, action.monday > today ? '/?week=next' : '/', NOTIFY_TAGS.weekly)
  } else {
    // Read and write without an await in between: two taps cannot both plan the day.
    const entry = getMealPlanRange(action.date, action.date)[0]
    const recipe = action.verb === 'plan' ? getRecipeById(action.recipeId) : null
    const decision = decideDayAction(
      action,
      {
        today,
        existing: entry ? { recipe_id: entry.recipe_id, custom_meal_name: entry.custom_meal_name, recipeName: entry.recipe?.name, suggested_by: entry.suggested_by } : null,
        recipe: recipe ? { id: recipe.id, name: recipe.name } : null,
      },
      person,
    )
    if (decision.write) {
      addMealPlanEntry({
        id: randomUUID(),
        date: decision.write.date,
        meal_type: 'dinner',
        recipe_id: decision.write.recipe_id,
        custom_meal_name: decision.write.custom_meal_name,
        servings: 2,
        notes: '',
        suggested_by: person || 'Vommeal',
        status: 'approved',
      })
    }
    ;({ outcome, reply, info } = decision)
    await deliver(reply, info, '/tonight', NOTIFY_TAGS.daily)
  }

  trackServer('notify_action', person, { verb: action.verb, outcome })
  console.log(`[notify-action] ${action.verb} by ${person || tapper?.service || 'unknown device'}: ${outcome}`)
  return { handled: true, verb: action.verb, outcome, reply, info }
}
