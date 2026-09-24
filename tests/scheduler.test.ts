import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vommeal-scheduler-'))
process.env.DATA_DIR = tmpDir

const { isDue, nextWeekDates, countEmptyEvenings, weeklyReminderMessage, dailyMessage, schedulerEnabled } = await import('../lib/scheduler')
const { zonedParts, normalizeSettingValue } = await import('../lib/config')
const { appLink, buildNotifyPayload } = await import('../lib/notify')

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('zonedParts', () => {
  it('uses the given time zone, not the server zone', () => {
    // 2026-09-27 is a Sunday; 16:30 UTC is 18:30 in Copenhagen (CEST).
    expect(zonedParts(new Date('2026-09-27T16:30:00Z'), 'Europe/Copenhagen'))
      .toEqual({ date: '2026-09-27', time: '18:30', weekday: 0 })
    // Same instant is already Monday in Tokyo.
    expect(zonedParts(new Date('2026-09-27T16:30:00Z'), 'Asia/Tokyo'))
      .toEqual({ date: '2026-09-28', time: '01:30', weekday: 1 })
  })

  it('follows daylight saving time', () => {
    expect(zonedParts(new Date('2026-01-15T17:00:00Z'), 'Europe/Copenhagen').time).toBe('18:00')
    expect(zonedParts(new Date('2026-07-15T16:00:00Z'), 'Europe/Copenhagen').time).toBe('18:00')
  })
})

describe('isDue', () => {
  const sunday1800 = { date: '2026-09-27', time: '18:00', weekday: 0 }

  it('runs at the time on the right weekday', () => {
    expect(isDue(sunday1800, { time: '18:00', weekday: 0, lastRun: null })).toBe(true)
    expect(isDue(sunday1800, { time: '18:00', weekday: 1, lastRun: null })).toBe(false)
  })

  it('does not run before the time', () => {
    expect(isDue({ ...sunday1800, time: '17:59' }, { time: '18:00', lastRun: null })).toBe(false)
  })

  it('runs only once per day', () => {
    expect(isDue(sunday1800, { time: '18:00', lastRun: '2026-09-27' })).toBe(false)
    expect(isDue(sunday1800, { time: '18:00', lastRun: '2026-09-26' })).toBe(true)
  })

  it('catches up within the window but not later', () => {
    expect(isDue({ ...sunday1800, time: '20:00' }, { time: '18:00', lastRun: null })).toBe(true)
    expect(isDue({ ...sunday1800, time: '21:01' }, { time: '18:00', lastRun: null })).toBe(false)
    expect(isDue({ ...sunday1800, time: '15:00' }, { time: '03:30', lastRun: null, windowMinutes: 720 })).toBe(true)
  })

  it('ignores malformed times', () => {
    expect(isDue(sunday1800, { time: '6pm', lastRun: null })).toBe(false)
  })
})

describe('next week', () => {
  it('is the Monday–Sunday after the current week', () => {
    // Sunday → starts tomorrow
    expect(nextWeekDates('2026-09-27', 0)).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ])
    // Monday → the following Monday
    expect(nextWeekDates('2026-09-21', 1)[0]).toBe('2026-09-28')
    // Saturday
    expect(nextWeekDates('2026-09-26', 6)[0]).toBe('2026-09-28')
  })

  it('counts empty evenings', () => {
    const dates = nextWeekDates('2026-09-27', 0)
    expect(countEmptyEvenings(dates, [])).toBe(7)
    expect(countEmptyEvenings(dates, ['2026-09-28', '2026-09-28', '2026-10-04', '2026-09-27'])).toBe(5)
  })
})

describe('messages', () => {
  it('weekly', () => {
    expect(weeklyReminderMessage(0)).toBeNull()
    expect(weeklyReminderMessage(1)).toBe('Nächste Woche ist noch 1 Abend frei – kurz planen?')
    expect(weeklyReminderMessage(4)).toBe('Nächste Woche sind noch 4 Abende frei – kurz planen?')
  })

  it('daily', () => {
    expect(dailyMessage(undefined)).toBe('Heute ist noch nichts geplant')
    expect(dailyMessage({ custom_meal_name: null, recipe: { name: 'Lasagne' } as never })).toBe('Heute: Lasagne')
    expect(dailyMessage({ custom_meal_name: 'Reste', recipe: undefined })).toBe('Heute: Reste')
  })
})

describe('notification payload', () => {
  it('links for iOS and Android when an app address is set', () => {
    const url = appLink('http://nas.tail.ts.net:3333/', '/?week=next')
    expect(url).toBe('http://nas.tail.ts.net:3333/?week=next')
    expect(buildNotifyPayload('Hi', url, 'vommeal-weekly')).toEqual({
      title: 'Vommeal', message: 'Hi', data: { url, clickAction: url, tag: 'vommeal-weekly' },
    })
  })

  it('omits link fields without an app address', () => {
    expect(appLink('', '/tonight')).toBe('')
    expect(buildNotifyPayload('Hi', '', 'vommeal-daily')).toEqual({ title: 'Vommeal', message: 'Hi', data: { tag: 'vommeal-daily' } })
  })
})

describe('scheduler gate', () => {
  it('only runs in production or when forced', () => {
    expect(schedulerEnabled({ NODE_ENV: 'development' })).toBe(false)
    expect(schedulerEnabled({ NODE_ENV: 'test' })).toBe(false)
    expect(schedulerEnabled({ NODE_ENV: 'development', VOMMEAL_SCHEDULER: '1' })).toBe(true)
    expect(schedulerEnabled({ NODE_ENV: 'production' })).toBe(true)
    expect(schedulerEnabled({ NODE_ENV: 'production', VOMMEAL_SCHEDULER: '0' })).toBe(false)
  })
})

describe('settings validation', () => {
  it('accepts valid values and normalizes', () => {
    expect(normalizeSettingValue('notify_weekly_day', '6')).toBe('6')
    expect(normalizeSettingValue('notify_daily_time', '07:05')).toBe('07:05')
    expect(normalizeSettingValue('timezone', 'Europe/Berlin')).toBe('Europe/Berlin')
    expect(normalizeSettingValue('app_public_url', '192.168.0.10:3333/')).toBe('http://192.168.0.10:3333')
    expect(normalizeSettingValue('app_public_url', '')).toBe('')
    expect(normalizeSettingValue('notify_services', '["notify.mobile_app_pixel","notify.mobile_app_pixel"]'))
      .toBe('["notify.mobile_app_pixel"]')
  })

  it('rejects bad values', () => {
    expect(() => normalizeSettingValue('notify_weekly_day', '7')).toThrow()
    expect(() => normalizeSettingValue('notify_weekly_time', '24:00')).toThrow()
    expect(() => normalizeSettingValue('notify_daily_time', '8:00')).toThrow()
    expect(() => normalizeSettingValue('notify_daily_enabled', 'yes')).toThrow()
    expect(() => normalizeSettingValue('timezone', 'Mars/Olympus')).toThrow()
    expect(() => normalizeSettingValue('app_public_url', 'ftp://x')).toThrow()
    expect(() => normalizeSettingValue('notify_services', 'notify.x')).toThrow()
    expect(() => normalizeSettingValue('notify_services', '["light.kitchen"]')).toThrow()
  })
})
