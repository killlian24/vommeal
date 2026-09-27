import { NextRequest, NextResponse } from 'next/server'
import { toggleShoppingItem, setShoppingItemChecked, deleteShoppingItem, getShoppingItemById, setShoppingItemCategory, CATEGORIES } from '@/lib/db'
import { getHomeAssistantConfig } from '@/lib/config'
import { completeHAItem, removeActiveHAItemsForLocalItems } from '@/lib/ha'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  if (typeof body.category === 'string') {
    if (!CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: 'Unbekannte Kategorie' }, { status: 400 })
    }
    setShoppingItemCategory(id, body.category)
    return NextResponse.json({ ok: true, item: getShoppingItemById(id) })
  }

  if (body.checked !== undefined && typeof body.checked !== 'boolean') {
    return NextResponse.json({ error: 'checked must be true or false' }, { status: 400 })
  }

  const item = getShoppingItemById(id)
  if (!item) return NextResponse.json({ error: 'Eintrag nicht gefunden' }, { status: 404 })

  // Clients send the target state so two quick taps (or both phones) cannot
  // cancel each other out. Without `checked` it toggles as before.
  const target: boolean = typeof body.checked === 'boolean' ? body.checked : !item.checked

  // If this is an HA item being checked off, mark it done in HA/Keep too
  if (target && !item.checked && item.ha_uid) {
    const config = getHomeAssistantConfig()
    if (config) {
      try {
        await completeHAItem(config, item)
      } catch (error) {
        return NextResponse.json({
          error: `Konnte in Home Assistant nicht abhaken${error instanceof Error ? `: ${error.message}` : ''}`,
        }, { status: 502 })
      }
    }
  }

  if (typeof body.checked === 'boolean') setShoppingItemChecked(id, target)
  else toggleShoppingItem(id)
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
          error: `Konnte in Home Assistant nicht entfernen${error instanceof Error ? `: ${error.message}` : ''}`,
        }, { status: 502 })
      }
    }
  }
  deleteShoppingItem(id)
  return NextResponse.json({ ok: true })
}
