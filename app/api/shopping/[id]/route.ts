import { NextRequest, NextResponse } from 'next/server'
import { toggleShoppingItem, deleteShoppingItem, getShoppingItemById, getSetting } from '@/lib/db'

export async function PATCH(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = getShoppingItemById(id)
  toggleShoppingItem(id)

  // If this is an HA item being checked off, mark it done in HA/Keep too
  if (item && !item.checked && item.ha_uid) {
    const haUrl = getSetting('ha_url')
    const token = getSetting('ha_token')
    const entity = getSetting('ha_entity')
    if (haUrl && token && entity) {
      fetch(`${haUrl}/api/services/todo/update_item`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: entity, item: item.name, status: 'completed' }),
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
