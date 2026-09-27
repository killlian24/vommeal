import { describe, it, expect, afterAll, beforeAll, beforeEach, vi } from 'vitest'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vommeal-hadash-'))
process.env.DATA_DIR = tmpDir

const db = await import('../lib/db')
const dash = await import('../lib/haDashboard')
const { DASHBOARD_CARD_YAML, calendarFeedUrl } = await import('../lib/haDashboardCard')
type Entry = import('../lib/planDisplay').PlanDisplayEntry

// --- Mock Home Assistant ----------------------------------------------------

type Received = { method: string; url: string; auth: string; body: { state: string; attributes: Record<string, unknown> } }
let received: Received[] = []
let mockStatus = 200
const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', c => { raw += c })
  req.on('end', () => {
    received.push({ method: req.method ?? '', url: req.url ?? '', auth: req.headers.authorization ?? '', body: raw ? JSON.parse(raw) : null })
    res.writeHead(mockStatus, { 'Content-Type': 'application/json' })
    res.end(mockStatus < 300 ? '{}' : '{"message":"nope"}')
  })
})
let mockUrl = ''

beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  mockUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  dash.resetDashboardState()
  await new Promise(resolve => server.close(resolve))
  db.getDb().close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// --- Fixtures -----------------------------------------------------------------

// Wednesday 2026-09-23; the week runs Mon 21.9. – Sun 27.9.
const TODAY = '2026-09-23'
const APP = 'https://vommeal.example.ts.net'

function recipeEntry(date: string, name: string, image = '', id = `r-${date}`): Entry {
  return {
    id: `mp-${date}`, date, recipe_id: id, custom_meal_name: null, suggested_by: 'Kilian',
    recipe: { name, image_url: image ? `/api/images/${id}?v=abc` : '' },
  }
}
function customEntry(date: string, name: string, by = 'Susi'): Entry {
  return { id: `mp-${date}`, date, recipe_id: null, custom_meal_name: name, suggested_by: by }
}

const ENTRIES: Entry[] = [
  recipeEntry('2026-09-21', 'Linsen mit Spätzle', 'img'),
  customEntry('2026-09-22', 'Auswärts essen'),
  recipeEntry('2026-09-23', 'Butter Chicken', 'img'),
  recipeEntry('2026-09-24', 'Pasta *scharf* [neu]'),
  customEntry('2026-09-26', 'Reste'),
  recipeEntry('2026-09-29', 'Tajine', 'img'),
]

const byId = (payloads: ReturnType<typeof dash.buildDashboard>) => Object.fromEntries(payloads.map(p => [p.entity_id, p]))

// --- Markdown -----------------------------------------------------------------

describe('renderWeekMarkdown (via sensor.vommeal_woche)', () => {
  const woche = (appUrl = '') => byId(dash.buildDashboard({ today: TODAY, entries: ENTRIES, appUrl }))['sensor.vommeal_woche']
  const lines = (appUrl = '') => String(woche(appUrl).attributes.markdown).split('  \n')

  it('has one line per day, Monday to Sunday', () => {
    const l = lines()
    expect(l).toHaveLength(7)
    expect(l.map(x => x.match(/(Mo|Di|Mi|Do|Fr|Sa|So) \d+\.\d+\./)?.[0])).toEqual([
      'Mo 21.9.', 'Di 22.9.', 'Mi 23.9.', 'Do 24.9.', 'Fr 25.9.', 'Sa 26.9.', 'So 27.9.',
    ])
  })

  it('marks today with 👉 and bold, strikes through past days', () => {
    const l = lines()
    expect(l[0]).toBe('~~Mo 21.9. Linsen mit Spätzle~~')
    expect(l[1]).toBe('~~Di 22.9. 🍽️ Auswärts essen~~')
    expect(l[2]).toBe('👉 **Mi 23.9. Butter Chicken**')
    expect(l.filter(x => x.includes('👉'))).toHaveLength(1)
  })

  it('shows free days as —, quick meals with their emoji and escapes markdown', () => {
    const l = lines()
    expect(l[3]).toBe('**Do 24.9.** Pasta \\*scharf\\* \\[neu\\]')
    expect(l[4]).toBe('**Fr 25.9.** —')
    expect(l[5]).toBe('**Sa 26.9.** 🍲 Reste')
    expect(l[6]).toBe('**So 27.9.** —')
  })

  it('links dish names to the recipe only when the app address is set (never quick meals)', () => {
    expect(String(woche().attributes.markdown)).not.toContain('](')
    const l = lines(APP)
    expect(l[2]).toBe(`👉 **Mi 23.9. [Butter Chicken](${APP}/recipes/r-2026-09-23)**`)
    expect(l[0]).toBe(`~~Mo 21.9. [Linsen mit Spätzle](${APP}/recipes/r-2026-09-21)~~`)
    expect(l[5]).toBe('**Sa 26.9.** 🍲 Reste')
  })

  it('renders next week without today marker or strike-through', () => {
    const md = String(woche(APP).attributes.markdown_naechste_woche)
    expect(md.split('  \n')).toHaveLength(7)
    expect(md).not.toContain('👉')
    expect(md).not.toContain('~~')
    expect(md.split('  \n')[1]).toBe(`**Di 29.9.** [Tajine](${APP}/recipes/r-2026-09-29)`)
  })
})

// --- Sensor payloads ------------------------------------------------------------

describe('buildDashboard', () => {
  it('builds heute and morgen with German attributes', () => {
    const p = byId(dash.buildDashboard({ today: TODAY, entries: ENTRIES, appUrl: APP }))
    const heute = p['sensor.vommeal_heute']
    expect(heute.state).toBe('Butter Chicken')
    expect(heute.attributes).toEqual({
      friendly_name: 'Vommeal Heute',
      icon: 'mdi:silverware-fork-knife',
      datum: '2026-09-23',
      wochentag: 'Mittwoch',
      geplant_von: 'Kilian',
      rezept_url: `${APP}/recipes/r-2026-09-23`,
      entity_picture: `${APP}/api/images/r-2026-09-23?v=abc`,
    })
    const morgen = p['sensor.vommeal_morgen']
    expect(morgen.state).toBe('Pasta *scharf* [neu]')
    expect(morgen.attributes.friendly_name).toBe('Vommeal Morgen')
    expect(morgen.attributes.wochentag).toBe('Donnerstag')
  })

  it('says "Nichts geplant" on a free evening and names quick meals plainly', () => {
    const free = byId(dash.buildDashboard({ today: '2026-09-25', entries: ENTRIES, appUrl: APP }))
    expect(free['sensor.vommeal_heute'].state).toBe('Nichts geplant')
    expect(free['sensor.vommeal_heute'].attributes.geplant_von).toBeNull()
    expect(free['sensor.vommeal_heute'].attributes).not.toHaveProperty('rezept_url')
    expect(free['sensor.vommeal_morgen'].state).toBe('Reste')
    expect(free['sensor.vommeal_morgen'].attributes.geplant_von).toBe('Susi')
    expect(free['sensor.vommeal_morgen'].attributes).not.toHaveProperty('entity_picture')
  })

  it('sets entity_picture only with app address and image, rezept_url only with app address', () => {
    const noApp = byId(dash.buildDashboard({ today: TODAY, entries: ENTRIES, appUrl: '' }))['sensor.vommeal_heute']
    expect(noApp.attributes).not.toHaveProperty('entity_picture')
    expect(noApp.attributes).not.toHaveProperty('rezept_url')
    const noImage = byId(dash.buildDashboard({ today: TODAY, entries: ENTRIES, appUrl: APP }))['sensor.vommeal_morgen']
    expect(noImage.attributes).not.toHaveProperty('entity_picture')
    expect(noImage.attributes.rezept_url).toBe(`${APP}/recipes/r-2026-09-24`)
    // Trailing slash in the app address does not double up
    const slash = byId(dash.buildDashboard({ today: TODAY, entries: ENTRIES, appUrl: `${APP}/` }))['sensor.vommeal_heute']
    expect(slash.attributes.entity_picture).toBe(`${APP}/api/images/r-2026-09-23?v=abc`)
  })

  it('keeps the state within 255 characters', () => {
    const long = 'Sehr langes Gericht '.repeat(30) + '🍝'
    const p = byId(dash.buildDashboard({ today: TODAY, entries: [recipeEntry(TODAY, long)], appUrl: '' }))
    const state = p['sensor.vommeal_heute'].state
    expect(Array.from(state).length).toBeLessThanOrEqual(255)
    expect(state.endsWith('…')).toBe(true)
    expect(dash.truncateState('kurz')).toBe('kurz')
    // Never splits an emoji into half a surrogate pair
    expect(dash.truncateState('🍝'.repeat(300))).toBe('🍝'.repeat(254) + '…')
  })

  it('counts the week and the free evenings from today to Sunday', () => {
    const woche = byId(dash.buildDashboard({ today: TODAY, entries: ENTRIES, appUrl: APP }))['sensor.vommeal_woche']
    expect(woche.state).toBe('5/7')
    expect(woche.attributes.friendly_name).toBe('Vommeal Woche')
    expect(woche.attributes.icon).toBe('mdi:calendar-week')
    expect(woche.attributes.frei).toBe(2) // Fr 25. and So 27.
    const tage = woche.attributes.tage as Record<string, unknown>[]
    expect(tage).toHaveLength(7)
    expect(tage[0]).toEqual({
      datum: '2026-09-21', tag: 'Mo', gericht: 'Linsen mit Spätzle', von: 'Kilian',
      bild: `${APP}/api/images/r-2026-09-21?v=abc`, heute: false, vorbei: true,
    })
    expect(tage[2]).toMatchObject({ tag: 'Mi', heute: true, vorbei: false })
    expect(tage[4]).toEqual({ datum: '2026-09-25', tag: 'Fr', gericht: null, von: null, bild: null, heute: false, vorbei: false })
    const next = woche.attributes.naechste_woche as Record<string, unknown>[]
    expect(next.map(d => d.datum)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(next[1]).toMatchObject({ tag: 'Di', gericht: 'Tajine' })
  })

  it('uses next Monday as tomorrow on a Sunday and starts the week on Monday', () => {
    const p = byId(dash.buildDashboard({ today: '2026-09-27', entries: ENTRIES, appUrl: '' }))
    expect(p['sensor.vommeal_morgen'].attributes.datum).toBe('2026-09-28')
    expect((p['sensor.vommeal_woche'].attributes.tage as { datum: string }[])[0].datum).toBe('2026-09-21')
    expect(p['sensor.vommeal_woche'].attributes.frei).toBe(1)
  })
})

// --- Fingerprint --------------------------------------------------------------------

describe('fingerprint and shouldPush', () => {
  const fp = (input: Partial<Parameters<typeof dash.buildDashboard>[0]> = {}, target = mockUrl) =>
    dash.dashboardFingerprint(dash.buildDashboard({ today: TODAY, entries: ENTRIES, appUrl: APP, ...input }), target)

  it('is stable for the same plan and changes with what HA would show', () => {
    expect(fp()).toBe(fp())
    expect(fp({ today: '2026-09-24' })).not.toBe(fp())
    expect(fp({ appUrl: '' })).not.toBe(fp())
    const renamed = ENTRIES.map(e => e.date === '2026-09-29' ? recipeEntry('2026-09-29', 'Tajine mit Couscous', 'img') : e)
    expect(fp({ entries: renamed })).not.toBe(fp())
    const newImage = ENTRIES.map(e => e.date === '2026-09-23' ? { ...e, recipe: { name: 'Butter Chicken', image_url: '/api/images/r-2026-09-23?v=xyz' } } : e)
    expect(fp({ entries: newImage })).not.toBe(fp())
    expect(fp({}, 'http://other-ha:8123')).not.toBe(fp())
  })

  it('pushes on change, every 30 minutes anyway, and waits after a failure', () => {
    const t0 = 1_000_000
    expect(dash.shouldPush('a', { fingerprint: null, pushedAt: null, failedAt: null }, t0)).toBe(true)
    expect(dash.shouldPush('a', { fingerprint: 'a', pushedAt: t0, failedAt: null }, t0 + 60_000)).toBe(false)
    expect(dash.shouldPush('b', { fingerprint: 'a', pushedAt: t0, failedAt: null }, t0 + 60_000)).toBe(true)
    expect(dash.shouldPush('a', { fingerprint: 'a', pushedAt: t0, failedAt: null }, t0 + 30 * 60_000)).toBe(true)
    expect(dash.shouldPush('b', { fingerprint: 'a', pushedAt: t0, failedAt: t0 + 1000 }, t0 + 2 * 60_000)).toBe(false)
    expect(dash.shouldPush('b', { fingerprint: 'a', pushedAt: t0, failedAt: t0 + 1000 }, t0 + 7 * 60_000)).toBe(true)
  })
})

// --- Push against a mock HA -------------------------------------------------------------

describe('pushSensors', () => {
  beforeEach(() => { received = []; mockStatus = 200 })

  it('posts every sensor to /api/states/<entity_id> with the bearer token', async () => {
    const payloads = dash.buildDashboard({ today: TODAY, entries: ENTRIES, appUrl: APP })
    await dash.pushSensors({ baseUrl: mockUrl, token: 'test-token' }, payloads)
    expect(received.map(r => `${r.method} ${r.url}`)).toEqual([
      'POST /api/states/sensor.vommeal_heute',
      'POST /api/states/sensor.vommeal_morgen',
      'POST /api/states/sensor.vommeal_woche',
    ])
    expect(received.every(r => r.auth === 'Bearer test-token')).toBe(true)
    expect(received[0].body).toEqual({ state: 'Butter Chicken', attributes: payloads[0].attributes })
    expect(received[2].body.state).toBe('5/7')
  })

  it('throws with the entity and status when HA refuses', async () => {
    mockStatus = 401
    await expect(dash.pushSensors({ baseUrl: mockUrl, token: 'bad' }, dash.buildDashboard({ today: TODAY, entries: [], appUrl: '' })))
      .rejects.toThrow(/sensor\.vommeal_heute: HA antwortet 401/)
    expect(received).toHaveLength(1)
  })
})

describe('pushDashboardNow (database + mock HA)', () => {
  // 10:00 UTC = 12:00 in Copenhagen on Wednesday 2026-09-23
  const NOW = new Date('2026-09-23T10:00:00Z')
  const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)

  beforeEach(() => {
    received = []; mockStatus = 200
    dash.resetDashboardState()
    db.getDb().exec('DELETE FROM meal_plan; DELETE FROM recipes;')
    db.setSetting('timezone', 'Europe/Copenhagen')
    db.setSetting('ha_dashboard_enabled', '1')
    db.setSetting('app_public_url', '')
    process.env.HA_URL = mockUrl
    process.env.HA_TOKEN = 'mock-token'
    delete process.env.HA_ENTITY // the todo entity is not needed
    db.upsertRecipe({ id: 'r1', name: 'Butter Chicken', image_url: 'http://mealie.local/api/media/recipes/r1/images/original.webp' })
    db.addMealPlanEntry({ id: 'p1', date: '2026-09-23', meal_type: 'dinner', recipe_id: 'r1', custom_meal_name: null, servings: 2, notes: '', status: 'approved', suggested_by: 'Kilian' })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('pushes once, skips unchanged plans, pushes again on change and after 30 minutes', async () => {
    expect(await dash.pushDashboardNow({ now: NOW })).toEqual({ ok: true, pushed: true })
    expect(received).toHaveLength(3)
    expect(received[0].auth).toBe('Bearer mock-token')
    expect(received[0].body.state).toBe('Butter Chicken')

    expect(await dash.pushDashboardNow({ now: later(1) })).toEqual({ ok: true, pushed: false })
    expect(received).toHaveLength(3)

    db.addMealPlanEntry({ id: 'p2', date: '2026-09-24', meal_type: 'dinner', recipe_id: null, custom_meal_name: 'Bestellen', servings: 2, notes: '', status: 'approved', suggested_by: 'Susi' })
    expect((await dash.pushDashboardNow({ now: later(2) })).pushed).toBe(true)
    expect(received).toHaveLength(6)
    expect(received[4].body.state).toBe('Bestellen')

    expect((await dash.pushDashboardNow({ now: later(20) })).pushed).toBe(false)
    expect((await dash.pushDashboardNow({ now: later(33) })).pushed).toBe(true)
  })

  it('uses the app address for pictures once it is set', async () => {
    db.setSetting('app_public_url', APP)
    await dash.pushDashboardNow({ now: NOW })
    expect(received[0].body.attributes.entity_picture).toMatch(new RegExp(`^${APP}/api/images/r1\\?v=\\w+$`))
    expect(received[0].body.attributes.rezept_url).toBe(`${APP}/recipes/r1`)
  })

  it('does nothing when switched off or without HA address/token', async () => {
    db.setSetting('ha_dashboard_enabled', '0')
    expect(await dash.pushDashboardNow({ now: NOW, force: true })).toMatchObject({ ok: false, skipped: 'disabled' })
    db.setSetting('ha_dashboard_enabled', '1')
    delete process.env.HA_TOKEN
    expect(await dash.pushDashboardNow({ now: NOW, force: true })).toMatchObject({ ok: false, skipped: 'unconfigured' })
    expect(received).toHaveLength(0)
  })

  it('reports failures without throwing and backs off', async () => {
    mockStatus = 500
    const r = await dash.pushDashboardNow({ now: NOW })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/500/)
    mockStatus = 200
    expect((await dash.pushDashboardNow({ now: later(1) })).pushed).toBe(false)
    expect((await dash.pushDashboardNow({ now: later(6) })).pushed).toBe(true)
    await expect(dash.dashboardTick(later(7))).resolves.toBeUndefined()
  })

  it('pushes shortly after a plan change once the sync is started (debounced)', async () => {
    dash.requestDashboardPush(10)
    await new Promise(r => setTimeout(r, 40))
    expect(received).toHaveLength(0) // not active yet: dev servers never push

    dash.startDashboardSync()
    db.addMealPlanEntry({ id: 'p3', date: '2026-09-25', meal_type: 'dinner', recipe_id: null, custom_meal_name: 'Reste', servings: 2, notes: '', status: 'approved', suggested_by: 'Susi' })
    db.moveMealPlanEntry('p3', '2026-09-26')
    await new Promise(r => setTimeout(r, dash.DEBOUNCE_MS + 500))
    expect(received.map(r => r.url)).toEqual([
      '/api/states/sensor.vommeal_heute', '/api/states/sensor.vommeal_morgen', '/api/states/sensor.vommeal_woche',
    ])
  }, 10_000)
})

describe('card YAML and calendar address', () => {
  it('references the three sensors and the markdown attribute', () => {
    expect(DASHBOARD_CARD_YAML).toContain('entity: sensor.vommeal_heute')
    expect(DASHBOARD_CARD_YAML).toContain('entity: sensor.vommeal_morgen')
    expect(DASHBOARD_CARD_YAML).toContain(`state_attr('sensor.vommeal_woche', 'markdown')`)
    expect(DASHBOARD_CARD_YAML).not.toMatch(/\t/)
  })

  it('matches the card shown in the README', () => {
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8')
    expect(readme).toContain('```yaml\n' + DASHBOARD_CARD_YAML + '```')
  })

  it('builds the feed address from the app address, else the page origin', () => {
    expect(calendarFeedUrl(`${APP}/`, 'http://192.168.0.5:3000')).toBe(`${APP}/api/calendar.ics`)
    expect(calendarFeedUrl('', 'http://192.168.0.5:3000')).toBe('http://192.168.0.5:3000/api/calendar.ics')
  })
})
