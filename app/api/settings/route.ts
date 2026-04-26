import { NextRequest, NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/db'
import { getConfigSourceFlags, sanitizeUrl } from '@/lib/config'
import { requireAdmin } from '@/lib/admin'

function stringValue(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  return typeof value === 'string' ? value : undefined
}

export async function GET() {
  const env = getConfigSourceFlags()
  return NextResponse.json({
    mealie_url: process.env.MEALIE_URL ? sanitizeUrl(process.env.MEALIE_URL) : getSetting('mealie_url') || '',
    mealie_token: (process.env.MEALIE_TOKEN || getSetting('mealie_token')) ? '••••••••' : '',
    has_token: !!(process.env.MEALIE_TOKEN || getSetting('mealie_token')),
    user1_name: getSetting('user1_name') || '',
    user2_name: getSetting('user2_name') || '',
    ha_url: process.env.HA_URL ? sanitizeUrl(process.env.HA_URL) : getSetting('ha_url') || '',
    ha_token: (process.env.HA_TOKEN || getSetting('ha_token')) ? '••••••••' : '',
    has_ha_token: !!(process.env.HA_TOKEN || getSetting('ha_token')),
    ha_entity: process.env.HA_ENTITY || getSetting('ha_entity') || '',
    dinner_category: getSetting('dinner_category') || '',
    category_order: getSetting('category_order') || '',
    env,
  })
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req)
  if (unauthorized) return unauthorized

  const rawBody = await req.json().catch(() => null)
  if (!rawBody || typeof rawBody !== 'object') {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const body = rawBody as Record<string, unknown>
  const env = getConfigSourceFlags()
  const mealieUrl = stringValue(body, 'mealie_url')
  const mealieToken = stringValue(body, 'mealie_token')
  const user1Name = stringValue(body, 'user1_name')
  const user2Name = stringValue(body, 'user2_name')
  const haUrl = stringValue(body, 'ha_url')
  const haToken = stringValue(body, 'ha_token')
  const haEntity = stringValue(body, 'ha_entity')
  const dinnerCategory = stringValue(body, 'dinner_category')
  const categoryOrder = stringValue(body, 'category_order')

  if (mealieUrl !== undefined && !env.mealie_url) setSetting('mealie_url', mealieUrl)
  if (mealieToken !== undefined && mealieToken !== '••••••••' && !env.mealie_token) {
    setSetting('mealie_token', mealieToken)
  }
  if (user1Name !== undefined) setSetting('user1_name', user1Name)
  if (user2Name !== undefined) setSetting('user2_name', user2Name)
  if (haUrl !== undefined && !env.ha_url) setSetting('ha_url', haUrl)
  if (haToken !== undefined && haToken !== '••••••••' && !env.ha_token) {
    setSetting('ha_token', haToken)
  }
  if (haEntity !== undefined && !env.ha_entity) setSetting('ha_entity', haEntity)
  if (dinnerCategory !== undefined) setSetting('dinner_category', dinnerCategory)
  if (categoryOrder !== undefined) setSetting('category_order', categoryOrder)
  return NextResponse.json({ ok: true })
}
