import { describe, it, expect } from 'vitest'
import { renderNotifyText, DEFAULT_NOTIFY_TEXTS } from '../lib/notifyTemplates'

describe('renderNotifyText', () => {
  it('uses the singular for one free evening', () => {
    expect(renderNotifyText(DEFAULT_NOTIFY_TEXTS.weekly, { name: 'Kilian', anzahl: 1 }))
      .toBe('Kilian: Nächste Woche ist noch 1 Abend frei – kurz planen?')
    expect(renderNotifyText(DEFAULT_NOTIFY_TEXTS.weekly, { name: 'Kilian', anzahl: 4 }))
      .toBe('Kilian: Nächste Woche sind noch 4 Abende frei – kurz planen?')
    expect(renderNotifyText('Noch {anzahl} Abende offen', { anzahl: 1 })).toBe('Noch 1 Abend offen')
  })
  it('drops an empty name cleanly at the start and inside a greeting', () => {
    expect(renderNotifyText(DEFAULT_NOTIFY_TEXTS.daily_planned, { gericht: 'Tajine' })).toBe('Heute gibt es Tajine 🍽️')
    expect(renderNotifyText('Hallo {name}! Heute gibt es {gericht}.', { gericht: 'Tajine' })).toBe('Hallo! Heute gibt es Tajine.')
    expect(renderNotifyText('Hey {name}, was essen wir?', {})).toBe('Hey, was essen wir?')
  })
  it('keeps the name when set', () => {
    expect(renderNotifyText('Hallo {name}! Heute gibt es {gericht}.', { name: 'Susi', gericht: 'Tajine' })).toBe('Hallo Susi! Heute gibt es Tajine.')
  })
  it('drops the suggestion sentence when there is no suggestion', () => {
    expect(renderNotifyText(DEFAULT_NOTIFY_TEXTS.daily_empty, { name: 'Susi' })).toBe('Susi: Heute Abend ist noch nichts geplant.')
    expect(renderNotifyText(DEFAULT_NOTIFY_TEXTS.daily_empty, { name: 'Susi', vorschlag: 'Butter Chicken' }))
      .toBe("Susi: Heute Abend ist noch nichts geplant. Wie wär's mit Butter Chicken?")
  })
})
