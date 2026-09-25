import { describe, it, expect } from 'vitest'
import { DEFAULT_NOTIFY_TEXTS, renderNotifyText, templateFor } from '../lib/notifyTemplates'
import {
  BUTTON_TITLE_MAX, cookButtonTitle, dailyEmptyNotification, dailyPlannedNotification, dayWord, deviceKey,
  formatAction, joinAppUrl, parseAction, truncate, weeklyNotification,
} from '../lib/notifyContent'

const RECIPE_ID = '0d0e7c74-ad24-435e-b101-086c326be731'
const KEY = deviceKey('notify.mobile_app_kilians_iphone')
const APP = 'http://nas.tail.ts.net:3333'

describe('renderNotifyText', () => {
  it('fills the placeholders', () => {
    expect(renderNotifyText(DEFAULT_NOTIFY_TEXTS.daily_planned, { name: 'Susi', gericht: 'Butter Chicken' }))
      .toBe('Susi, heute gibt es Butter Chicken 🍽️')
    expect(renderNotifyText(DEFAULT_NOTIFY_TEXTS.weekly, { name: 'Kilian', anzahl: 4 }))
      .toBe('Kilian: Nächste Woche sind noch 4 Abende frei – kurz planen?')
  })

  it('drops an empty name together with its separator and capitalizes', () => {
    expect(renderNotifyText(DEFAULT_NOTIFY_TEXTS.daily_planned, { name: '', gericht: 'Lasagne' }))
      .toBe('Heute gibt es Lasagne 🍽️')
    expect(renderNotifyText(DEFAULT_NOTIFY_TEXTS.weekly, { name: '  ', anzahl: 2 }))
      .toBe('Nächste Woche sind noch 2 Abende frei – kurz planen?')
  })

  it('drops the sentence with an empty suggestion', () => {
    expect(renderNotifyText(DEFAULT_NOTIFY_TEXTS.daily_empty, { name: 'Kilian', vorschlag: '' }))
      .toBe('Kilian: Heute Abend ist noch nichts geplant.')
    expect(renderNotifyText(DEFAULT_NOTIFY_TEXTS.daily_empty, { name: '', vorschlag: '' }))
      .toBe('Heute Abend ist noch nichts geplant.')
    expect(renderNotifyText(DEFAULT_NOTIFY_TEXTS.daily_empty, { name: 'Susi', vorschlag: 'Pizza' }))
      .toBe("Susi: Heute Abend ist noch nichts geplant. Wie wär's mit Pizza?")
  })

  it('keeps unknown placeholders visible and uses defaults for empty templates', () => {
    expect(renderNotifyText('Hallo {nmae}', { name: 'Kilian' })).toBe('Hallo {nmae}')
    expect(templateFor('weekly', '  ')).toBe(DEFAULT_NOTIFY_TEXTS.weekly)
    expect(templateFor('weekly', 'Planen, {name}!')).toBe('Planen, {name}!')
  })
})

describe('buttons', () => {
  it('shortens long recipe names so "… kochen" fits', () => {
    expect(cookButtonTitle('Pizza')).toBe('Pizza kochen')
    const long = cookButtonTitle('Spätzleteig Grundrezept - schwäbische Köstlichkeit (1)')
    expect(Array.from(long).length).toBeLessThanOrEqual(BUTTON_TITLE_MAX)
    expect(long).toBe('Spätzleteig Grun… kochen')
    // Exactly at the limit (17 + " kochen" = 24): not cut; one more character: cut.
    expect(cookButtonTitle('Butter Chicken XL')).toBe('Butter Chicken XL kochen')
    expect(cookButtonTitle('Butter Chicken XXL')).toBe('Butter Chicken X… kochen')
    expect(Array.from(cookButtonTitle('Linsen mit Spätzle und Saitenwürstchen')).length).toBeLessThanOrEqual(24)
  })

  it('truncates by characters, not bytes, and trims before the ellipsis', () => {
    expect(truncate('Äpfel Äpfel Äpfel', 7)).toBe('Äpfel…')
    expect(truncate('kurz', 10)).toBe('kurz')
  })

  it('joins app links', () => {
    expect(joinAppUrl(`${APP}/`, '/tonight')).toBe(`${APP}/tonight`)
    expect(joinAppUrl('', '/tonight')).toBe('')
  })
})

describe('action ids', () => {
  it('round-trips through parseAction', () => {
    const plan = formatAction('plan', ['2026-09-25', RECIPE_ID], KEY)
    expect(plan).toBe(`VOMMEAL|plan|2026-09-25,${RECIPE_ID}|${KEY}`)
    expect(plan.length).toBeLessThan(80)
    expect(parseAction(plan)).toEqual({ verb: 'plan', date: '2026-09-25', recipeId: RECIPE_ID, deviceKey: KEY })
    expect(parseAction(formatAction('leftovers', ['2026-09-25'], KEY))).toEqual({ verb: 'leftovers', date: '2026-09-25', deviceKey: KEY })
    expect(parseAction(formatAction('fillweek', ['2026-09-28'], KEY))).toEqual({ verb: 'fillweek', monday: '2026-09-28', deviceKey: KEY })
    expect(parseAction(formatAction('test', ['plan'], KEY))).toEqual({ verb: 'test', original: 'plan', deviceKey: KEY })
    expect(parseAction(`VOMMEAL|test||${KEY}`)).toEqual({ verb: 'test', original: '', deviceKey: KEY })
  })

  it('rejects everything else', () => {
    for (const bad of [
      undefined, 42, '', 'URI', 'VOMMEAL', 'OTHER|plan|2026-09-25,abc|k1',
      `VOMMEAL|plan|2026-09-25|${KEY}`, // recipe missing
      `VOMMEAL|plan|25.09.2026,${RECIPE_ID}|${KEY}`,
      `VOMMEAL|plan|2026-09-25,bad id|${KEY}`,
      `VOMMEAL|leftovers|2026-09-25|UPPER`,
      `VOMMEAL|leftovers|2026-09-25`,
      `VOMMEAL|delete|2026-09-25|${KEY}`,
      `VOMMEAL|fillweek|2026-09-28|${KEY}|extra`,
      `VOMMEAL|plan|2026-09-25,${'x'.repeat(300)}|${KEY}`,
    ]) {
      expect(parseAction(bad)).toBeNull()
    }
  })

  it('device keys are short, stable and distinct', () => {
    const a = deviceKey('notify.mobile_app_kilians_iphone')
    const b = deviceKey('notify.mobile_app_sm_s911b')
    expect(a).toMatch(/^[a-z0-9]{1,7}$/)
    expect(a).toBe(deviceKey('notify.mobile_app_kilians_iphone'))
    expect(a).not.toBe(b)
  })
})

describe('notifications', () => {
  const common = { template: DEFAULT_NOTIFY_TEXTS.daily_empty, name: 'Kilian', deviceKey: KEY, appUrl: APP, date: '2026-09-25' }

  it('daily planned has no buttons', () => {
    expect(dailyPlannedNotification({ template: DEFAULT_NOTIFY_TEXTS.daily_planned, name: 'Susi', gericht: 'Butter Chicken' }))
      .toEqual({ message: 'Susi, heute gibt es Butter Chicken 🍽️', path: '/tonight', actions: [] })
  })

  it('daily empty suggests a recipe with three buttons', () => {
    const n = dailyEmptyNotification({ ...common, suggestion: { id: RECIPE_ID, name: 'Butter Chicken' } })
    expect(n.message).toBe("Kilian: Heute Abend ist noch nichts geplant. Wie wär's mit Butter Chicken?")
    expect(n.actions).toEqual([
      { action: `VOMMEAL|plan|2026-09-25,${RECIPE_ID}|${KEY}`, title: 'Butter Chicken kochen' },
      { action: `VOMMEAL|leftovers|2026-09-25|${KEY}`, title: 'Reste' },
      { action: 'URI', title: 'Andere Ideen', uri: `${APP}/tonight` },
    ])
  })

  it('daily empty without a suggestion keeps Reste and Andere Ideen', () => {
    const n = dailyEmptyNotification({ ...common, suggestion: null })
    expect(n.message).toBe('Kilian: Heute Abend ist noch nichts geplant.')
    expect(n.actions.map(a => a.title)).toEqual(['Reste', 'Andere Ideen'])
  })

  it('leaves URL buttons out without an app address', () => {
    const n = dailyEmptyNotification({ ...common, appUrl: '', suggestion: null })
    expect(n.actions.map(a => a.title)).toEqual(['Reste'])
  })

  it('test notifications use the test verb', () => {
    const n = dailyEmptyNotification({ ...common, suggestion: { id: RECIPE_ID, name: 'Pizza' }, test: true })
    expect(n.actions.slice(0, 2).map(a => a.action)).toEqual([`VOMMEAL|test|plan|${KEY}`, `VOMMEAL|test|leftovers|${KEY}`])
    expect(n.actions.every(a => a.action === 'URI' || parseAction(a.action)?.verb === 'test')).toBe(true)
  })

  it('weekly offers Woche füllen and Selbst planen', () => {
    const n = weeklyNotification({ template: DEFAULT_NOTIFY_TEXTS.weekly, name: '', deviceKey: KEY, appUrl: APP, anzahl: 5, monday: '2026-09-28' })
    expect(n.message).toBe('Nächste Woche sind noch 5 Abende frei – kurz planen?')
    expect(n.path).toBe('/?week=next')
    expect(n.actions).toEqual([
      { action: `VOMMEAL|fillweek|2026-09-28|${KEY}`, title: 'Woche füllen' },
      { action: 'URI', title: 'Selbst planen', uri: `${APP}/?week=next` },
    ])
  })

  it('every button title fits', () => {
    const n = dailyEmptyNotification({ ...common, suggestion: { id: RECIPE_ID, name: 'Linsen mit Spätzle und Saitenwürstchen' } })
    for (const a of n.actions) expect(Array.from(a.title).length).toBeLessThanOrEqual(BUTTON_TITLE_MAX)
  })
})

describe('dayWord', () => {
  it('names the day relative to today', () => {
    expect(dayWord('2026-09-25', '2026-09-25')).toBe('heute')
    expect(dayWord('2026-09-26', '2026-09-25')).toBe('morgen')
    expect(dayWord('2026-10-01', '2026-09-25')).toBe('am 01.10.')
  })
})
