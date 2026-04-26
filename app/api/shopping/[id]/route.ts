import { NextRequest, NextResponse } from 'next/server'
import { toggleShoppingItem, deleteShoppingItem, getShoppingItemById, setShoppingItemCategory, CATEGORIES } from '@/lib/db'
import { getHomeAssistantConfig } from '@/lib/config'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  if (typeof body.category === 'string') {
    if (!CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: 'invalid category' }, { status: 400 })
    }
    setShoppingItemCategory(id, body.category)
    return NextResponse.json({ ok: true, item: getShoppingItemById(id) })
  }

  const item = getShoppingItemById(id)
  toggleShoppingItem(id)

  // If this is an HA item being checked off, mark it done in HA/Keep too
  if (item && !item.checked && item.ha_uid) {
    const config = getHomeAssistantConfig()
    if (config) {
      await fetch(`${config.baseUrl}/api/services/todo/update_item`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: config.entity, item: item.name, status: 'completed' }),
      }).catch(() => { /* best-effort */ })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  deleteShoppingItem(id)
  return NextResponse.json({ ok: true })
}
