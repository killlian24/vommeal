import { NextRequest, NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/db'
import { getConfigSourceFlags, sanitizeUrl } from '@/lib/config'

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
  const body = await req.json()
  const env = getConfigSourceFlags()
  if (body.mealie_url !== undefined && !env.mealie_url) setSetting('mealie_url', body.mealie_url)
  if (body.mealie_token !== undefined && body.mealie_token !== '••••••••' && !env.mealie_token) {
    setSetting('mealie_token', body.mealie_token)
  }
  if (body.user1_name !== undefined) setSetting('user1_name', body.user1_name)
  if (body.user2_name !== undefined) setSetting('user2_name', body.user2_name)
  if (body.ha_url !== undefined && !env.ha_url) setSetting('ha_url', body.ha_url)
  if (body.ha_token !== undefined && body.ha_token !== '••••••••' && !env.ha_token) {
    setSetting('ha_token', body.ha_token)
  }
  if (body.ha_entity !== undefined && !env.ha_entity) setSetting('ha_entity', body.ha_entity)
  if (body.dinner_category !== undefined) setSetting('dinner_category', body.dinner_category)
  if (body.category_order !== undefined) setSetting('category_order', body.category_order)
  return NextResponse.json({ ok: true })
}
