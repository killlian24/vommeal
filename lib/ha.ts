import type { HomeAssistantConfig } from './config'
import type { ShoppingItem } from './db'

export type HATodoItem = { summary: string; uid: string; status: string }

export function normalizeShoppingText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function shoppingLabel(item: Pick<ShoppingItem, 'amount' | 'unit' | 'name'>): string {
  return [item.amount, item.unit, item.name].filter(Boolean).join(' ').trim()
}

export function shoppingSummaryCandidates(item: Pick<ShoppingItem, 'amount' | 'unit' | 'name' | 'ha_summary'>): string[] {
  return Array.from(new Set([
    item.ha_summary ?? '',
    shoppingLabel(item),
    item.name,
  ].map(value => value.trim()).filter(Boolean)))
}

export async function haService<T = unknown>(
  config: HomeAssistantConfig,
  path: string,
  body: unknown,
  attempts = 2
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(`${config.baseUrl}/api/services/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HA ${path} returned ${res.status}: ${text.slice(0, 200)}`)
      }
      return res.json().catch(() => ({} as T))
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, 250 * attempt))
      }
    }
  }
  throw lastError
}

export async function fetchHAItems(config: HomeAssistantConfig): Promise<HATodoItem[]> {
  const data = await haService<{ service_response?: Record<string, { items?: HATodoItem[] }> }>(
    config,
    'todo/get_items?return_response',
    { entity_id: config.entity, status: ['needs_action'] }
  )
  return data?.service_response?.[config.entity]?.items?.filter(item => item.summary?.trim()) ?? []
}

export async function addHAItem(config: HomeAssistantConfig, summary: string) {
  await haService(config, 'todo/add_item', { entity_id: config.entity, item: summary })
}

export async function removeHAItem(config: HomeAssistantConfig, summary: string) {
  await haService(config, 'todo/remove_item', { entity_id: config.entity, item: summary })
}

export async function completeHAItem(config: HomeAssistantConfig, item: ShoppingItem) {
  const candidates = shoppingSummaryCandidates(item)
  let lastError: unknown

  for (const summary of candidates) {
    try {
      await haService(config, 'todo/update_item', {
        entity_id: config.entity,
        item: summary,
        status: 'completed',
      })
      return
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error('HA item could not be completed')
}

export function findMatchingHAItem(local: ShoppingItem, haItems: HATodoItem[], usedUids = new Set<string>()): HATodoItem | null {
  const keys = new Set(shoppingSummaryCandidates(local).map(normalizeShoppingText))
  return haItems.find(item => !usedUids.has(item.uid) && keys.has(normalizeShoppingText(item.summary))) ?? null
}

export async function removeActiveHAItemsForLocalItems(config: HomeAssistantConfig, items: ShoppingItem[]): Promise<number> {
  const active = await fetchHAItems(config)
  const usedUids = new Set<string>()
  let removed = 0

  for (const item of items) {
    const match = findMatchingHAItem(item, active, usedUids)
    if (!match) continue

    await removeHAItem(config, match.summary)
    usedUids.add(match.uid)
    removed++
  }

  return removed
}
