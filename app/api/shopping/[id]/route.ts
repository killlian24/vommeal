import { NextRequest, NextResponse } from 'next/server'
import { toggleShoppingItem, deleteShoppingItem, getShoppingItemById, setShoppingItemCategory, CATEGORIES } from '@/lib/db'
import { getHomeAssistantConfig } from '@/lib/config'
import { completeHAItem, removeActiveHAItemsForLocalItems } from '@/lib/ha'

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
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // If this is an HA item being checked off, mark it done in HA/Keep too
  if (!item.checked && item.ha_uid) {
    const config = getHomeAssistantConfig()
    if (config) {
      try {
        await completeHAItem(config, item)
      } catch (error) {
        return NextResponse.json({
          error: error instanceof Error ? error.message : 'could not complete Home Assistant item',
        }, { status: 502 })
      }
    }
  }

  toggleShoppingItem(id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = getShoppingItemById(id)
  if (item && !item.checked) {
    const config = getHomeAssistantConfig()
    if (config) {
      try {
        await removeActiveHAItemsForLocalItems(config, [item])
      } catch (error) {
        return NextResponse.json({
          error: error instanceof Error ? error.message : 'could not remove Home Assistant item',
        }, { status: 502 })
      }
    }
  }
  deleteShoppingItem(id)
  return NextResponse.json({ ok: true })
}
