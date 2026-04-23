import { NextResponse } from 'next/server'
import { getSetting, addShoppingItem, haUidExists, getAllShoppingItems, checkShoppingItem, setShoppingItemHaUid, setShoppingItemCategory, findUntrackedItemByName } from '@/lib/db'
import { getHomeAssistantConfig } from '@/lib/config'
import { categorize } from '@/lib/categorize'
import { v4 as uuidv4 } from 'uuid'

type HATodoItem = { summary: string; uid: string; status: string }

async function fetchHAItems(haUrl: string, token: string, entity: string): Promise<HATodoItem[]> {
  const res = await fetch(`${haUrl}/api/services/todo/get_items?return_response`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_id: entity, status: ['needs_action'] }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HA returned ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  return data?.service_response?.[entity]?.items ?? []
}

export async function POST() {
  const config = getHomeAssistantConfig()

  if (!config) {
    return NextResponse.json({ error: 'Home Assistant not configured. Add your credentials in Settings.' }, { status: 400 })
  }
  const { baseUrl: haUrl, token, entity } = config

  // Push any local unchecked items that haven't been sent to HA yet,
  // in category order so Google Keep reflects supermarket aisle sequence
  const defaultOrder = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other']
  let categoryOrder = defaultOrder
  const savedOrder = getSetting('category_order')
  if (savedOrder) { try { categoryOrder = JSON.parse(savedOrder) } catch { /* use default */ } }

  const unsynced = getAllShoppingItems()
    .filter(i => !i.checked && !i.ha_uid)
    .sort((a, b) => {
      const ai = categoryOrder.indexOf(a.category)
      const bi = categoryOrder.indexOf(b.category)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })

  // Push sequentially to preserve order in Google Keep
  for (const item of unsynced) {
    const label = [item.amount, item.unit, item.name].filter(Boolean).join(' ')
    await fetch(`${haUrl}/api/services/todo/add_item`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: entity, item: label }),
    }).catch(() => {}) // best-effort per item
  }

  // Fetch all needs_action items from HA (after push so we get fresh uids)
  let haItems: HATodoItem[] = []
  try {
    haItems = await fetchHAItems(haUrl, token, entity)
  } catch (e) {
    return NextResponse.json({ error: `Cannot reach Home Assistant: ${String(e)}` }, { status: 503 })
  }

  const activeUids = new Set(haItems.map(i => i.uid))
  const activeNames = new Set(haItems.map(i => i.summary?.toLowerCase().trim()).filter(Boolean))

  // Link uids to any local items we just pushed (match by combined label or name)
  if (unsynced.length > 0) {
    const haByName = new Map(haItems.map(i => [i.summary?.toLowerCase().trim(), i.uid]))
    for (const item of unsynced) {
      const label = [item.amount, item.unit, item.name].filter(Boolean).join(' ').toLowerCase().trim()
      const uid = haByName.get(label) ?? haByName.get(item.name.toLowerCase().trim())
      if (uid) setShoppingItemHaUid(item.id, uid)
    }
  }

  // Add new items from HA that aren't already in Vommeal
  let added = 0
  for (const item of haItems) {
    if (!item.summary?.trim()) continue
    if (haUidExists(item.uid)) continue  // already tracked by uid

    // Check if this item already exists locally by name (e.g. pushed from meal plan
    // but ha_uid wasn't stored yet). If so, just link the uid — don't duplicate.
    const existing = findUntrackedItemByName(item.summary.trim())
    if (existing) {
      setShoppingItemHaUid(existing.id, item.uid)
      continue
    }

    addShoppingItem({
      id: uuidv4(),
      name: item.summary.trim(),
      amount: '',
      unit: '',
      category: categorize(item.summary.trim()),
      checked: false,
      source: 'ha',
      meal_plan_id: null,
      ha_uid: item.uid,
      sort_order: 0,
    })
    added++
  }

  // Recategorize any existing HA-sourced items stuck in 'other' (migration for older synced items)
  const allLocal = getAllShoppingItems()
  for (const local of allLocal) {
    if (local.category === 'other' && (local.source === 'ha' || local.ha_uid)) {
      const cat = categorize(local.name)
      if (cat !== 'other') setShoppingItemCategory(local.id, cat)
    }
  }

  // Check off any Vommeal items that are no longer active in HA
  // (they were checked off / deleted in HA/Keep)
  let checked = 0
  const localItems = allLocal.filter(i => !i.checked)
  for (const local of localItems) {
    if (local.ha_uid) {
      // Item was pushed to or came from HA — check if it's still active
      if (!activeUids.has(local.ha_uid)) {
        checkShoppingItem(local.id)
        checked++
      }
    } else if (local.source === 'ha') {
      // Older items without ha_uid — fall back to name matching
      if (!activeNames.has(local.name.toLowerCase().trim())) {
        checkShoppingItem(local.id)
        checked++
      }
    }
  }

  // Sort HA list by category order using move_item (requires HA Google Keep integration v1.1.0+)
  let sorted = 0
  let sortError: string | null = null
  if (haItems.length > 0) {
    const categorized = haItems.map(item => ({
      ...item,
      catIndex: (() => {
        const cat = categorize(item.summary ?? '')
        const idx = categoryOrder.indexOf(cat)
        return idx === -1 ? 999 : idx
      })(),
    }))
    categorized.sort((a, b) => a.catIndex - b.catIndex)

    let prevSummary: string | null = null
    for (const item of categorized) {
      try {
        const res = await fetch(`${haUrl}/api/services/todo/move_item`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity_id: entity,
            item: item.summary,
            ...(prevSummary ? { previous_item: prevSummary } : {}),
          }),
        })
        if (res.ok) {
          sorted++
        } else if (!sortError) {
          const text = await res.text()
          sortError = `move_item failed (${res.status}): ${text.slice(0, 200)}`
        }
      } catch (e) {
        if (!sortError) sortError = `move_item error: ${String(e)}`
      }
      prevSummary = item.summary
    }
  }

  return NextResponse.json({ ok: true, added, checked, sorted, sortError })
}
