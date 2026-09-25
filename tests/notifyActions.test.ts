import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vommeal-actions-'))
process.env.DATA_DIR = tmpDir

const db = await import('../lib/db')
const { decideDayAction, fillWeekMessages, handleNotificationAction, otherRecipients, resetActionState, rememberTestServices } = await import('../lib/notifyActions')
const { deviceKey, formatAction } = await import('../lib/notifyContent')
const { getRecipients } = await import('../lib/notify')
const { normalizeSettingValue } = await import('../lib/config')

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const IPHONE = 'notify.mobile_app_kilians_iphone'
const ANDROID = 'notify.mobile_app_sm_s911b'
const IPAD = 'notify.mobile_app_ipad'
const K_IPHONE = deviceKey(IPHONE)
const K_ANDROID = deviceKey(ANDROID)

// 10:00 UTC on Friday 2026-09-25 = 12:00 in Copenhagen.
const NOW = new Date('2026-09-25T10:00:00Z')
const TODAY = '2026-09-25'

type Sent = { service: string; payload: { message: string; data: { tag: string; actions?: unknown[] } } }
let sent: Sent[] = []
const send = async (items: Sent[]) => {
  sent.push(...items)
  return { ok: true, sent: items.length, errors: [] }
}
const deps = () => ({ now: NOW, send: send as never, random: () => 0.5 })
const to = (service: string) => sent.filter(s => s.service === service).map(s => s.payload.message)

function reset() {
  const d = db.getDb()
  d.exec('DELETE FROM meal_plan; DELETE FROM events; DELETE FROM recipes;')
  db.setSetting('user1_name', 'Kilian')
  db.setSetting('user2_name', 'Susi')
  db.setSetting('notify_services', JSON.stringify([IPHONE, ANDROID, IPAD]))
  db.setSetting('notify_people', JSON.stringify({ [IPHONE]: 'Kilian', [ANDROID]: 'Susi', [IPAD]: 'Kilian' }))
  db.setSetting('timezone', 'Europe/Copenhagen')
  db.upsertRecipe({ id: 'r-butter', name: 'Butter Chicken', rating: 5 })
  db.upsertRecipe({ id: 'r-pasta', name: 'Pasta', rating: null })
  resetActionState()
  sent = []
}

beforeEach(reset)

describe('decideDayAction (pure)', () => {
  const plan = { verb: 'plan' as const, date: TODAY, recipeId: 'r1', deviceKey: 'k' }
  const recipe = { id: 'r1', name: 'Butter Chicken' }

  it('plans an empty day', () => {
    const d = decideDayAction(plan, { today: TODAY, existing: null, recipe }, 'Kilian')
    expect(d.outcome).toBe('planned')
    expect(d.write).toEqual({ date: TODAY, recipe_id: 'r1', custom_meal_name: null })
    expect(d.reply).toBe('✓ Butter Chicken ist für heute geplant')
    expect(d.info).toBe('Kilian hat Butter Chicken für heute geplant')
  })

  it('never overwrites a planned day', () => {
    const d = decideDayAction(plan, { today: TODAY, existing: { recipe_id: 'r2', custom_meal_name: null, recipeName: 'Pasta', suggested_by: 'Susi' }, recipe }, 'Kilian')
    expect(d).toEqual({ outcome: 'already', write: null, reply: 'Heute ist schon Pasta geplant (von Susi)', info: null })
  })

  it('treats the same dish as success without writing', () => {
    const d = decideDayAction(plan, { today: TODAY, existing: { recipe_id: 'r1', custom_meal_name: null }, recipe }, 'Susi')
    expect(d).toEqual({ outcome: 'same', write: null, reply: '✓ Butter Chicken ist für heute geplant', info: null })
  })

  it('leftovers', () => {
    const d = decideDayAction({ verb: 'leftovers', date: TODAY, deviceKey: 'k' }, { today: TODAY, existing: null, recipe: null }, '')
    expect(d.write).toEqual({ date: TODAY, recipe_id: null, custom_meal_name: 'Reste' })
    expect(d.reply).toBe('✓ Reste für heute eingetragen')
    expect(d.info).toBe('Reste sind für heute eingetragen')
  })

  it('expired and missing recipes change nothing', () => {
    expect(decideDayAction({ ...plan, date: '2026-09-24' }, { today: TODAY, existing: null, recipe }, 'Kilian').outcome).toBe('expired')
    expect(decideDayAction(plan, { today: TODAY, existing: null, recipe: null }, 'Kilian').write).toBeNull()
  })

  it('fill week messages', () => {
    expect(fillWeekMessages({ ok: true, filled: 5 }, 'Susi')).toEqual({ reply: '✓ 5 Abende gefüllt', info: 'Susi hat nächste Woche 5 Abende gefüllt' })
    expect(fillWeekMessages({ ok: true, filled: 1 }, '').reply).toBe('✓ 1 Abend gefüllt')
    expect(fillWeekMessages({ ok: true, filled: 0 }, 'Susi').info).toBeNull()
    expect(fillWeekMessages({ ok: false, error: 'Keine Rezepte' }, 'Susi').reply).toContain('Keine Rezepte')
  })

  it('informs the other person only', () => {
    const all = [
      { service: IPHONE, name: 'Kilian', key: 'a' },
      { service: IPAD, name: 'Kilian', key: 'b' },
      { service: ANDROID, name: 'Susi', key: 'c' },
      { service: 'notify.mobile_app_tablet', name: '', key: 'd' },
    ]
    expect(otherRecipients(all, all[0], 'Kilian').map(r => r.service)).toEqual([ANDROID, 'notify.mobile_app_tablet'])
    expect(otherRecipients(all, all[3], '').map(r => r.service)).toEqual([IPHONE, IPAD, ANDROID])
  })
})

describe('handleNotificationAction', () => {
  it('plans an empty day, answers the tapper and informs the other person', async () => {
    const r = await handleNotificationAction(formatAction('plan', [TODAY, 'r-butter'], K_IPHONE), deps())
    expect(r.outcome).toBe('planned')
    const [entry] = db.getMealPlanRange(TODAY, TODAY)
    expect(entry).toMatchObject({ recipe_id: 'r-butter', suggested_by: 'Kilian', status: 'approved' })
    expect(to(IPHONE)).toEqual(['✓ Butter Chicken ist für heute geplant'])
    expect(to(ANDROID)).toEqual(['Kilian hat Butter Chicken für heute geplant'])
    expect(to(IPAD)).toEqual([]) // Kilian's other device
    // Same tag as the reminder, so the answer replaces it; no buttons.
    expect(sent.every(s => s.payload.data.tag === 'vommeal-daily' && !s.payload.data.actions)).toBe(true)
    const events = db.getDb().prepare("SELECT user_name, props FROM events WHERE name = 'notify_action'").all() as { user_name: string; props: string }[]
    expect(events).toEqual([{ user_name: 'Kilian', props: JSON.stringify({ verb: 'plan', outcome: 'planned' }) }])
  })

  it('does not change a day someone already planned', async () => {
    await handleNotificationAction(formatAction('plan', [TODAY, 'r-butter'], K_IPHONE), deps())
    sent = []
    const r = await handleNotificationAction(formatAction('leftovers', [TODAY], K_ANDROID), deps())
    expect(r.outcome).toBe('already')
    expect(db.getMealPlanRange(TODAY, TODAY)).toHaveLength(1)
    expect(db.getMealPlanRange(TODAY, TODAY)[0].recipe_id).toBe('r-butter')
    expect(to(ANDROID)).toEqual(['Heute ist schon Butter Chicken geplant (von Kilian)'])
    expect(to(IPHONE)).toEqual([])
  })

  it('ignores the same event delivered twice', async () => {
    const action = formatAction('leftovers', [TODAY], K_ANDROID)
    const [a, b] = await Promise.all([handleNotificationAction(action, deps()), handleNotificationAction(action, deps())])
    expect([a.outcome, b.outcome].sort()).toEqual(['duplicate', 'planned'])
    expect(db.getMealPlanRange(TODAY, TODAY)).toMatchObject([{ custom_meal_name: 'Reste', suggested_by: 'Susi' }])
    expect(to(ANDROID)).toEqual(['✓ Reste für heute eingetragen'])
  })

  it('both tapping the same button is harmless', async () => {
    await handleNotificationAction(formatAction('plan', [TODAY, 'r-butter'], K_IPHONE), deps())
    sent = []
    const r = await handleNotificationAction(formatAction('plan', [TODAY, 'r-butter'], K_ANDROID), deps())
    expect(r.outcome).toBe('same')
    expect(db.getMealPlanRange(TODAY, TODAY)).toHaveLength(1)
    expect(sent).toEqual([expect.objectContaining({ service: ANDROID })])
  })

  it('fills next week once', async () => {
    const monday = '2026-09-28'
    db.addMealPlanEntry({ id: 'x', date: '2026-09-30', meal_type: 'dinner', recipe_id: null, custom_meal_name: 'Bestellen', servings: 2, notes: '', status: 'approved', suggested_by: 'Susi' })
    const r = await handleNotificationAction(formatAction('fillweek', [monday], K_ANDROID), deps())
    expect(r.outcome).toBe('filled')
    const week = db.getMealPlanRange(monday, '2026-10-04')
    expect(week).toHaveLength(7)
    expect(week.filter(e => e.recipe_id).every(e => e.suggested_by === 'Susi')).toBe(true)
    expect(to(ANDROID)).toEqual(['✓ 6 Abende gefüllt'])
    expect(to(IPHONE)).toEqual(['Susi hat nächste Woche 6 Abende gefüllt'])
    expect(sent.every(s => s.payload.data.tag === 'vommeal-weekly')).toBe(true)

    sent = []
    const again = await handleNotificationAction(formatAction('fillweek', [monday], K_IPHONE), deps())
    expect(again.outcome).toBe('already')
    expect(db.getMealPlanRange(monday, '2026-10-04')).toHaveLength(7)
    expect(to(IPHONE)).toEqual(['✓ Die Woche ist schon komplett geplant'])
    expect(to(ANDROID)).toEqual([])
  })

  it('test buttons only answer', async () => {
    const tablet = 'notify.mobile_app_tablet' // not saved yet, only used for the test message
    rememberTestServices([tablet])
    const r = await handleNotificationAction(formatAction('test', ['plan'], deviceKey(tablet)), deps())
    expect(r.outcome).toBe('test')
    expect(db.getMealPlanRange(TODAY, TODAY)).toHaveLength(0)
    expect(sent).toEqual([{ service: tablet, payload: expect.objectContaining({ message: '✓ Der Knopf funktioniert' }) }])
    expect(sent[0].payload.data.tag).toBe('vommeal-test')
  })

  it('ignores junk and old reminders', async () => {
    expect((await handleNotificationAction('VOMMEAL|rm -rf|x|y', deps())).handled).toBe(false)
    const r = await handleNotificationAction(formatAction('leftovers', ['2026-09-24'], K_IPHONE), deps())
    expect(r.outcome).toBe('expired')
    expect(db.getMealPlanRange('2026-09-24', '2026-09-24')).toHaveLength(0)
  })

  it('recipients carry the person per device', () => {
    expect(getRecipients().map(r => [r.service, r.name])).toEqual([[IPHONE, 'Kilian'], [ANDROID, 'Susi'], [IPAD, 'Kilian']])
  })
})

describe('settings validation', () => {
  it('notify_people maps devices to profile names', () => {
    const ctx = { profileNames: ['Kilian', 'Susi'] }
    expect(normalizeSettingValue('notify_people', JSON.stringify({ [IPHONE]: 'Kilian', [ANDROID]: ' Susi ', [IPAD]: '' }), ctx))
      .toBe(JSON.stringify({ [IPHONE]: 'Kilian', [ANDROID]: 'Susi' }))
    expect(normalizeSettingValue('notify_people', '', ctx)).toBe('{}')
    expect(() => normalizeSettingValue('notify_people', JSON.stringify({ [IPHONE]: 'Mallory' }), ctx)).toThrow()
    expect(() => normalizeSettingValue('notify_people', JSON.stringify({ 'light.kitchen': 'Kilian' }), ctx)).toThrow()
    expect(() => normalizeSettingValue('notify_people', JSON.stringify({ [IPHONE]: 1 }), ctx)).toThrow()
    expect(() => normalizeSettingValue('notify_people', '["Kilian"]', ctx)).toThrow()
    // Without a context the saved profile names are used.
    expect(normalizeSettingValue('notify_people', JSON.stringify({ [IPHONE]: 'Susi' }))).toBe(JSON.stringify({ [IPHONE]: 'Susi' }))
  })

  it('notification texts are limited', () => {
    expect(normalizeSettingValue('notify_text_weekly', '  Planen, {name}!  ')).toBe('Planen, {name}!')
    expect(normalizeSettingValue('notify_text_daily_empty', '')).toBe('')
    expect(() => normalizeSettingValue('notify_text_daily_planned', 'x'.repeat(201))).toThrow()
  })
})
