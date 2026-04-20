import { NextRequest, NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/db'

export async function GET() {
  return NextResponse.json({
    mealie_url: getSetting('mealie_url') || '',
    mealie_token: getSetting('mealie_token') ? '••••••••' : '',
    has_token: !!getSetting('mealie_token'),
    user1_name: getSetting('user1_name') || '',
    user2_name: getSetting('user2_name') || '',
    ha_url: getSetting('ha_url') || '',
    ha_token: getSetting('ha_token') ? '••••••••' : '',
    has_ha_token: !!getSetting('ha_token'),
    ha_entity: getSetting('ha_entity') || '',
    dinner_category: getSetting('dinner_category') || '',
    category_order: getSetting('category_order') || '',
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (body.mealie_url !== undefined) setSetting('mealie_url', body.mealie_url)
  if (body.mealie_token !== undefined && body.mealie_token !== '••••••••') {
    setSetting('mealie_token', body.mealie_token)
  }
  if (body.user1_name !== undefined) setSetting('user1_name', body.user1_name)
  if (body.user2_name !== undefined) setSetting('user2_name', body.user2_name)
  if (body.ha_url !== undefined) setSetting('ha_url', body.ha_url)
  if (body.ha_token !== undefined && body.ha_token !== '••••••••') {
    setSetting('ha_token', body.ha_token)
  }
  if (body.ha_entity !== undefined) setSetting('ha_entity', body.ha_entity)
  if (body.dinner_category !== undefined) setSetting('dinner_category', body.dinner_category)
  if (body.category_order !== undefined) setSetting('category_order', body.category_order)
  return NextResponse.json({ ok: true })
}
