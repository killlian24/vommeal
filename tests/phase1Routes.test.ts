import { describe, it, expect, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Route-level contracts for two people on stale screens (B1, B3, B7).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vommeal-routes-'))
process.env.DATA_DIR = tmpDir
for (const key of ['HA_URL', 'HA_TOKEN', 'HA_ENTITY', 'MEALIE_URL', 'MEALIE_TOKEN']) delete process.env[key]

// The routes import through the "@/…" alias, which vitest does not resolve here.
vi.mock('@/lib/db', () => import('../lib/db'))
vi.mock('@/lib/validate', () => import('../lib/validate'))
vi.mock('@/lib/config', () => import('../lib/config'))
vi.mock('@/lib/ha', () => import('../lib/ha'))

const db = await import('../lib/db')
const planRoute = await import('../app/api/meal-plan/route')
const planIdRoute = await import('../app/api/meal-plan/[id]/route')
const shopIdRoute = await import('../app/api/shopping/[id]/route')

afterAll(() => {
  db.getDb().close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const req = (body?: unknown) => ({ json: async () => body, url: 'http://localhost/api' }) as never
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

async function plan(body: Record<string, unknown>) {
  const res = await planRoute.POST(req({ meal_type: 'dinner', servings: 2, ...body }))
  return { status: res.status, data: await res.json() }
}

describe('POST /api/meal-plan with an expectation', () => {
  it('answers 409 with the current entry instead of overwriting', async () => {
    expect((await plan({ date: '2026-10-10', custom_meal_name: 'Shakshuka', suggested_by: 'Susi', expect_empty: true })).status).toBe(201)
    const stale = await plan({ date: '2026-10-10', custom_meal_name: 'Tajine', suggested_by: 'Kilian', expect_empty: true })
    expect(stale.status).toBe(409)
    expect(stale.data.current.custom_meal_name).toBe('Shakshuka')
    expect(stale.data.current.suggested_by).toBe('Susi')

    // "Trotzdem ersetzen" resends with replace_id
    const forced = await plan({ date: '2026-10-10', custom_meal_name: 'Tajine', replace_id: stale.data.current.id })
    expect(forced.status).toBe(201)
    expect(db.getMealPlanRange('2026-10-10', '2026-10-10').map(e => e.custom_meal_name)).toEqual(['Tajine'])
  })

  it('still overwrites for callers that send no expectation', async () => {
    await plan({ date: '2026-10-11', custom_meal_name: 'Pasta' })
    expect((await plan({ date: '2026-10-11', custom_meal_name: 'Curry' })).status).toBe(201)
    expect(db.getMealPlanRange('2026-10-11', '2026-10-11').map(e => e.custom_meal_name)).toEqual(['Curry'])
  })

  it('rejects a non-boolean expect_empty', async () => {
    expect((await plan({ date: '2026-10-12', custom_meal_name: 'X', expect_empty: 'yes' })).status).toBe(400)
  })
})

describe('DELETE /api/meal-plan/[id]', () => {
  it('answers 404 when the entry is already gone', async () => {
    const { data } = await plan({ date: '2026-10-13', custom_meal_name: 'Suppe' })
    expect((await planIdRoute.DELETE(req(), ctx(data.id))).status).toBe(200)
    expect((await planIdRoute.DELETE(req(), ctx(data.id))).status).toBe(404)
  })
})

describe('PATCH /api/shopping/[id]', () => {
  const add = (id: string) => db.addShoppingItem({
    id, name: 'Milch', amount: '', unit: '', category: 'dairy', checked: false,
    source: 'manual', meal_plan_id: null, ha_uid: null, sort_order: 0,
  })
  const patch = async (id: string, body?: unknown) => (await shopIdRoute.PATCH(req(body), ctx(id))).status
  const checked = (id: string) => db.getShoppingItemById(id)!.checked

  it('sets the target state idempotently, so two phones do not cancel out', async () => {
    add('s1')
    expect(await patch('s1', { checked: true })).toBe(200)
    expect(await patch('s1', { checked: true })).toBe(200)
    expect(checked('s1')).toBe(true)
    expect(await patch('s1', { checked: false })).toBe(200)
    expect(await patch('s1', { checked: false })).toBe(200)
    expect(checked('s1')).toBe(false)
  })

  it('keeps toggling for requests without a target', async () => {
    add('s2')
    await patch('s2', {})
    expect(checked('s2')).toBe(true)
    await patch('s2', {})
    expect(checked('s2')).toBe(false)
  })

  it('rejects a non-boolean target', async () => {
    add('s3')
    expect(await patch('s3', { checked: 'ja' })).toBe(400)
  })
})
