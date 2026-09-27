import { describe, it, expect, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// B8: typing "Milch" twice, or "Zwiebeln" while "Zwiebel" is open, gives one row.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vommeal-dupes-'))
process.env.DATA_DIR = tmpDir
for (const key of ['HA_URL', 'HA_TOKEN', 'HA_ENTITY', 'MEALIE_URL', 'MEALIE_TOKEN']) delete process.env[key]

vi.mock('@/lib/db', () => import('../lib/db'))
vi.mock('@/lib/config', () => import('../lib/config'))
vi.mock('@/lib/ha', () => import('../lib/ha'))
vi.mock('@/lib/categorize', () => import('../lib/categorize'))
vi.mock('@/lib/shoppingMeals', () => import('../lib/shoppingMeals'))
vi.mock('@/lib/shoppingKey', () => import('../lib/shoppingKey'))

const db = await import('../lib/db')
const route = await import('../app/api/shopping/route')

afterAll(() => {
  db.getDb().close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const req = (body?: unknown) => ({ json: async () => body, url: 'http://localhost/api/shopping' }) as never
async function add(name: string) {
  const res = await route.POST(req({ name }))
  return { status: res.status, data: await res.json() }
}

describe('manual add on Einkauf', () => {
  it('does not add a second open row with the same name', async () => {
    const first = await add('Milch')
    expect(first.status).toBe(201)
    const again = await add(' milch ')
    expect(again.status).toBe(200)
    expect(again.data).toMatchObject({ id: first.data.id, duplicate: true })
    expect(db.getAllShoppingItems().filter(i => i.name.toLowerCase().includes('milch'))).toHaveLength(1)
  })

  it('treats singular and plural as the same entry', async () => {
    expect((await add('Zwiebel')).status).toBe(201)
    expect((await add('Zwiebeln')).data.duplicate).toBe(true)
  })

  it('adds again once the old row is checked off', async () => {
    const milk = db.getAllShoppingItems().find(i => i.name === 'Milch')!
    db.checkShoppingItem(milk.id)
    expect((await add('Milch')).status).toBe(201)
  })
})
