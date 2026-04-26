import { NextResponse } from 'next/server'
import {
  addShoppingItem,
  checkShoppingItem,
  createSyncRun,
  finishSyncRun,
  getAllShoppingItems,
  getSetting,
  markShoppingItemSeenInHa,
  markShoppingItemSyncStatus,
  setShoppingItemCategory,
  setShoppingItemHaUid,
  ShoppingItem,
} from '@/lib/db'
import { getHomeAssistantConfig } from '@/lib/config'
import { categorize } from '@/lib/categorize'
import { randomUUID } from 'crypto'

type HATodoItem = { summary: string; uid: string; status: string }

type SyncStats = {
  imported: number
  linked: number
  pushed: number
  checked: number
  sorted: number
  needsCategory: number
  restored: number
}

const DEFAULT_CATEGORY_ORDER = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other']

function normalizeShoppingText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function labelFor(item: Pick<ShoppingItem, 'amount' | 'unit' | 'name'>): string {
  return [item.amount, item.unit, item.name].filter(Boolean).join(' ').trim()
}

function categoryOrder(): string[] {
  const savedOrder = getSetting('category_order')
  if (!savedOrder) return DEFAULT_CATEGORY_ORDER
  try {
    const parsed = JSON.parse(savedOrder)
    if (Array.isArray(parsed) && parsed.every(v => typeof v === 'string')) {
      return Array.from(new Set([...parsed, ...DEFAULT_CATEGORY_ORDER]))
    }
  } catch { /* use default */ }
  return DEFAULT_CATEGORY_ORDER
}

async function haService<T = unknown>(haUrl: string, token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${haUrl}/api/services/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HA ${path} returned ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json().catch(() => ({} as T))
}

async function fetchHAItems(haUrl: string, token: string, entity: string): Promise<HATodoItem[]> {
  const data = await haService<{ service_response?: Record<string, { items?: HATodoItem[] }> }>(
    haUrl,
    token,
    'todo/get_items?return_response',
    { entity_id: entity, status: ['needs_action'] }
  )
  return data?.service_response?.[entity]?.items?.filter(item => item.summary?.trim()) ?? []
}

async function addHAItem(haUrl: string, token: string, entity: string, summary: string) {
  await haService(haUrl, token, 'todo/add_item', { entity_id: entity, item: summary })
}

async function removeHAItem(haUrl: string, token: string, entity: string, summary: string) {
  await haService(haUrl, token, 'todo/remove_item', { entity_id: entity, item: summary })
}

function localKeys(item: ShoppingItem): string[] {
  return Array.from(new Set([
    normalizeShoppingText(labelFor(item)),
    normalizeShoppingText(item.name),
    item.ha_summary ? normalizeShoppingText(item.ha_summary) : '',
  ].filter(Boolean)))
}

function findLocalByHaSummary(haItem: HATodoItem, localItems: ShoppingItem[], usedLocalIds: Set<string>): ShoppingItem | null {
  const summaryKey = normalizeShoppingText(haItem.summary)
  const candidates = localItems.filter(item => !item.checked && !item.ha_uid && !usedLocalIds.has(item.id))

  return candidates.find(item => normalizeShoppingText(labelFor(item)) === summaryKey)
    ?? candidates.find(item => normalizeShoppingText(item.name) === summaryKey)
    ?? candidates.find(item => item.ha_summary && normalizeShoppingText(item.ha_summary) === summaryKey)
    ?? null
}

function findLocalForHaItem(haItem: HATodoItem, localItems: ShoppingItem[]): ShoppingItem | null {
  const byUid = localItems.find(item => item.ha_uid === haItem.uid)
  if (byUid) return byUid

  const summaryKey = normalizeShoppingText(haItem.summary)
  return localItems.find(item => !item.checked && localKeys(item).includes(summaryKey)) ?? null
}

function categoryIndex(category: string, order: string[]): number {
  const index = order.indexOf(category)
  return index === -1 ? 999 : index
}

function countSummaries(items: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = normalizeShoppingText(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

async function restoreMissingHAItems(haUrl: string, token: string, entity: string, expectedSummaries: string[]): Promise<number> {
  const current = await fetchHAItems(haUrl, token, entity)
  const currentCounts = countSummaries(current.map(item => item.summary))
  let restored = 0

  for (const summary of expectedSummaries) {
    const key = normalizeShoppingText(summary)
    const count = currentCounts.get(key) ?? 0
    if (count > 0) {
      currentCounts.set(key, count - 1)
      continue
    }
    await addHAItem(haUrl, token, entity, summary)
    restored++
  }

  return restored
}

function refreshUidLinksFromHa(haItems: HATodoItem[], stats: SyncStats) {
  const queues = new Map<string, HATodoItem[]>()
  for (const haItem of haItems) {
    const key = normalizeShoppingText(haItem.summary)
    queues.set(key, [...(queues.get(key) ?? []), haItem])
  }

  const usedUids = new Set<string>()
  for (const local of getAllShoppingItems().filter(item => !item.checked)) {
    for (const key of localKeys(local)) {
      const queue = queues.get(key)?.filter(item => !usedUids.has(item.uid)) ?? []
      const match = queue[0]
      if (!match) continue

      usedUids.add(match.uid)
      if (local.ha_uid !== match.uid || local.ha_summary !== match.summary) {
        setShoppingItemHaUid(local.id, match.uid, match.summary)
        stats.linked++
      } else {
        markShoppingItemSeenInHa(local.id, match.uid, match.summary)
      }
      break
    }
  }
}

export async function POST() {
  const config = getHomeAssistantConfig()
  if (!config) {
    return NextResponse.json({ error: 'Home Assistant not configured. Add your credentials in Settings.' }, { status: 400 })
  }

  const runId = randomUUID()
  const stats: SyncStats = { imported: 0, linked: 0, pushed: 0, checked: 0, sorted: 0, needsCategory: 0, restored: 0 }
  createSyncRun(runId, 'ha_sync')

  const { baseUrl: haUrl, token, entity } = config
  const order = categoryOrder()

  try {
    let haItems = await fetchHAItems(haUrl, token, entity)
    let localItems = getAllShoppingItems()
    const usedLocalIds = new Set<string>()

    for (const haItem of haItems) {
      const existingByUid = localItems.find(item => item.ha_uid === haItem.uid)
      if (existingByUid) {
        markShoppingItemSeenInHa(existingByUid.id, haItem.uid, haItem.summary)
        usedLocalIds.add(existingByUid.id)
        continue
      }

      const existingByText = findLocalByHaSummary(haItem, localItems, usedLocalIds)
      if (existingByText) {
        markShoppingItemSeenInHa(existingByText.id, haItem.uid, haItem.summary)
        usedLocalIds.add(existingByText.id)
        stats.linked++
        continue
      }

      const category = categorize(haItem.summary)
      addShoppingItem({
        id: randomUUID(),
        name: haItem.summary.trim(),
        amount: '',
        unit: '',
        category,
        checked: false,
        source: 'ha',
        meal_plan_id: null,
        ha_uid: haItem.uid,
        ha_summary: haItem.summary.trim(),
        normalized_name: normalizeShoppingText(haItem.summary),
        last_seen_in_ha_at: new Date().toISOString(),
        sync_status: category === 'other' ? 'needs_category' : 'ok',
        sort_order: 999,
      })
      stats.imported++
      if (category === 'other') stats.needsCategory++
    }

    localItems = getAllShoppingItems()
    const activeUids = new Set(haItems.map(item => item.uid))
    for (const local of localItems.filter(item => !item.checked && item.ha_uid)) {
      if (local.ha_uid && !activeUids.has(local.ha_uid)) {
        checkShoppingItem(local.id)
        stats.checked++
      }
    }

    for (const local of getAllShoppingItems()) {
      if (local.category === 'other' && (local.source === 'ha' || local.ha_uid)) {
        const category = categorize(local.name)
        if (category !== 'other') {
          setShoppingItemCategory(local.id, category)
        } else {
          markShoppingItemSyncStatus(local.id, 'needs_category')
          stats.needsCategory++
        }
      }
    }

    const toPush = getAllShoppingItems()
      .filter(item => !item.checked && !item.ha_uid)
      .sort((a, b) =>
        categoryIndex(a.category, order) - categoryIndex(b.category, order)
        || a.sort_order - b.sort_order
        || a.name.localeCompare(b.name)
      )

    for (const item of toPush) {
      await addHAItem(haUrl, token, entity, labelFor(item))
      stats.pushed++
    }

    haItems = await fetchHAItems(haUrl, token, entity)
    refreshUidLinksFromHa(haItems, stats)

    const latestLocal = getAllShoppingItems()
    const sortItems = haItems
      .map((haItem, originalIndex) => {
        const local = findLocalForHaItem(haItem, latestLocal)
        const category = local?.category ?? categorize(haItem.summary)
        return {
          summary: haItem.summary,
          originalIndex,
          category,
          sortOrder: local?.sort_order ?? 999,
        }
      })
      .sort((a, b) =>
        categoryIndex(a.category, order) - categoryIndex(b.category, order)
        || a.sortOrder - b.sortOrder
        || a.summary.localeCompare(b.summary)
      )

    const currentOrder = haItems.map(item => item.summary).join('\n')
    const desiredOrder = sortItems.map(item => item.summary).join('\n')

    if (haItems.length > 1 && currentOrder !== desiredOrder) {
      const expectedSummaries = sortItems.map(item => item.summary)
      try {
        for (const item of haItems) {
          await removeHAItem(haUrl, token, entity, item.summary)
        }
        for (const item of sortItems) {
          await addHAItem(haUrl, token, entity, item.summary)
        }
        stats.sorted = sortItems.length
      } catch (error) {
        stats.restored += await restoreMissingHAItems(haUrl, token, entity, expectedSummaries)
        throw error
      }
    }

    haItems = await fetchHAItems(haUrl, token, entity)
    refreshUidLinksFromHa(haItems, stats)

    const summary = { runId, ...stats }
    finishSyncRun(runId, 'ok', summary)
    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const summary = { runId, ...stats }
    finishSyncRun(runId, 'error', summary, message)
    return NextResponse.json({ ok: false, error: message, ...summary }, { status: 503 })
  }
}
