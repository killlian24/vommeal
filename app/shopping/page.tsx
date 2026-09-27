'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Check, Plus, Copy, RefreshCw, ChevronDown, ChevronRight, X, Package, Search,
  MoreHorizontal, ListPlus, Trash2,
} from 'lucide-react'
import { format, startOfWeek, addDays, isToday } from 'date-fns'
import { de } from 'date-fns/locale'
import { track } from '@/lib/track'
import { useToast } from '@/components/Toast'
import { todayIso } from '@/lib/dates'
import { WeekIngredientsSheet } from '@/components/WeekIngredientsSheet'
import { runHaSync, syncSummary, type SyncResult } from '@/lib/haSync'
import { useServices } from '@/lib/useServices'
import Link from 'next/link'
import { CATEGORY_LABELS, DEFAULT_CATEGORY_ORDER, CATEGORIES, plural } from '@/lib/shoppingLabels'
import { apiCall } from '@/lib/apiCall'
import { useRefreshOnResume } from '@/lib/useRefreshOnResume'
import { categorizeWithRules } from '@/lib/categoryRules'
import {
  type QueuedOp, enqueue, applyQueue, flushQueue, newItemId, readCache, writeCache, readQueue, writeQueue,
} from '@/lib/shoppingOffline'

type ShoppingItem = {
  id: string; name: string; amount: string; unit: string
  category: string; checked: boolean; source: string
  meal_plan_id?: string | null; ha_uid?: string | null; sort_order?: number
  recipe_names?: string[]; meal_plan_ids?: string[]
}
type PantryStaple = { id: string; name: string }

const ERROR_MS = 6000
const SEARCH_THRESHOLD = 8
// While the list is open it picks up the partner's changes this often
const POLL_MS = 20_000

/** "für Linsen, Tajine": which meals a row is for. */
function mealsLabel(names: string[] | undefined): string {
  return names && names.length > 0 ? `für ${names.join(', ')}` : ''
}

function endOfNextWeek(): string {
  return format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 13), 'yyyy-MM-dd')
}

/** An item added while offline, until the server has it. */
function offlineItem(op: { id: string; name: string; checked: boolean }): ShoppingItem {
  return {
    id: op.id, name: op.name, amount: '', unit: '', checked: op.checked, source: 'manual',
    category: categorizeWithRules(op.name, {}), recipe_names: [], meal_plan_ids: [],
  }
}

/** "14:05" today, otherwise "Mo 14:05" */
function standLabel(at: number): string {
  const d = new Date(at)
  return format(d, isToday(d) ? 'HH:mm' : 'EEEEEE HH:mm', { locale: de })
}

const changes = (n: number) => `${n} ${n === 1 ? 'Änderung' : 'Änderungen'}`

export default function ShoppingPage() {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [categoryOrder, setCategoryOrder] = useState<string[]>(DEFAULT_CATEGORY_ORDER)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [newItem, setNewItem] = useState('')
  const [showPantry, setShowPantry] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [staples, setStaples] = useState<PantryStaple[]>([])
  const [newStaple, setNewStaple] = useState('')
  const [search, setSearch] = useState('')
  const { show: showToast, error: showErrorToast, hide: hideToast } = useToast()
  const showError = (msg: string) => showErrorToast(msg, { duration: ERROR_MS })
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  // Outcome of the last Abgleichen, shown under the buttons (errors only there, no toast)
  const [lastSync, setLastSync] = useState<(SyncResult & { setup?: boolean }) | null>(null)
  const services = useServices()
  const haReady = services?.ha !== false
  // "Zutaten der Woche" sheet (today to the end of next week)
  const [reviewOpen, setReviewOpen] = useState(false)
  // Loading failed and there is nothing to show: error state instead of "leer"
  const [loadError, setLoadError] = useState(false)
  // No connection at the last attempt
  const [offline, setOffline] = useState(false)
  // Shown list is older than the server: time it last came from the server
  const [staleAt, setStaleAt] = useState<number | null>(null)
  // Changes made offline, waiting to be sent (mirrored in localStorage)
  const [queue, setQueue] = useState<QueuedOp[]>([])
  // When the list last came from the server (for the cache)
  const serverAt = useRef(0)
  // Local changes on their way: background loads must not paint over them
  const mutations = useRef({ pending: 0, gen: 0 })
  const flushing = useRef(false)

  // Escape closes the menu (the review sheet handles Escape itself)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const beginMutation = () => { mutations.current.pending++; mutations.current.gen++ }
  const endMutation = () => { mutations.current.pending = Math.max(0, mutations.current.pending - 1) }

  const goOffline = () => {
    setOffline(true)
    if (serverAt.current) setStaleAt(serverAt.current)
  }

  const updateQueue = (next: QueuedOp[]) => { writeQueue(next); setQueue(next) }
  const queueOp = (op: QueuedOp) => updateQueue(enqueue(readQueue(), op))

  // `background`: polling / coming back to the app. Never shows a skeleton
  // or toast, and drops its result if the list was changed meanwhile.
  const load = async (showSkeleton = true, background = false) => {
    if (showSkeleton) setLoading(true)
    const gen = mutations.current.gen
    const res = await apiCall<ShoppingItem[]>('/api/shopping')
    if (res.ok && Array.isArray(res.data)) {
      setOffline(false)
      if (!(background && (mutations.current.pending > 0 || mutations.current.gen !== gen))) {
        // Changes still waiting in the queue stay visible on top
        const waiting = readQueue()
        serverAt.current = Date.now()
        setItems(applyQueue(res.data, waiting, offlineItem))
        setQueue(waiting)
        setStaleAt(null)
        setLoadError(false)
      }
    } else {
      // Keep what is on screen, otherwise the list this phone saw last
      setOffline(res.status === 0)
      const cache = readCache<ShoppingItem>()
      const waiting = readQueue()
      setQueue(waiting)
      if (serverAt.current) {
        setStaleAt(serverAt.current)
      } else if (cache) {
        setItems(applyQueue(cache.items, waiting, offlineItem))
        setStaleAt(cache.at)
        setLoadError(false)
      } else {
        setLoadError(true)
      }
    }
    setLoading(false)
  }

  // Send what was changed offline, oldest first
  const flush = async () => {
    const waiting = readQueue()
    if (waiting.length === 0 || flushing.current) return
    flushing.current = true
    beginMutation()
    try {
      const { remaining, sent } = await flushQueue(waiting, async op => {
        if (op.kind === 'check') {
          const r = await apiCall(`/api/shopping/${op.id}`, { method: 'PATCH', body: { checked: op.checked } })
          return { ok: r.ok, status: r.status }
        }
        if (op.kind === 'delete') {
          const r = await apiCall(`/api/shopping/${op.id}`, { method: 'DELETE' })
          return { ok: r.ok, status: r.status }
        }
        // 409: sent before, only the answer got lost
        const r = await apiCall('/api/shopping', { method: 'POST', body: { id: op.id, name: op.name } })
        if (!r.ok && r.status !== 409) return { ok: false, status: r.status }
        if (!op.checked) return { ok: true, status: r.status }
        const c = await apiCall(`/api/shopping/${op.id}`, { method: 'PATCH', body: { checked: true } })
        return { ok: c.ok, status: c.status }
      })
      // Operations queued while sending stay behind the unsent ones
      const later = readQueue().slice(waiting.length)
      updateQueue(later.reduce(enqueue, remaining))
      if (sent > 0) track('shopping_offline_flush', { sent })
    } finally {
      endMutation()
      flushing.current = false
    }
  }

  const reload = async (showSkeleton = false, background = false) => {
    await flush()
    await load(showSkeleton, background)
  }

  // The list this phone saw last, for the next offline start
  useEffect(() => {
    if (loading || loadError || !serverAt.current && !staleAt) return
    writeCache({ items, at: staleAt ?? serverAt.current })
  }, [items, loading, loadError, staleAt])

  // Coming back to the app or online, and every 20 s while the list is open
  useRefreshOnResume(() => { reload(false, true) }, { pollMs: POLL_MS })

  const loadStaples = async () => {
    try {
      const res = await fetch('/api/pantry')
      if (!res.ok) throw new Error('pantry load failed')
      setStaples(await res.json())
    } catch { /* the pantry panel just stays empty */ }
  }

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(s => {
      if (s.category_order) {
        try { setCategoryOrder(JSON.parse(s.category_order)) } catch { /* use default */ }
      }
    }).catch(() => { /* keep default order */ })
    // Changes from an earlier offline visit go out first
    setQueue(readQueue())
    reload(true)
    loadStaples()
  }, [])

  // Rollbacks only touch the affected item, so a second quick tap that did
  // succeed is not undone with it.
  const revertItem = (id: string, patch: Partial<ShoppingItem>) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))

  // Long press (or the context menu) on a row opens its category; the tap
  // that ends a long press must not also check the item off.
  const categoryPress = useRef<{ id: string; timer: number; x: number; y: number } | null>(null)
  const suppressTap = useRef(false)
  const pressStart = (e: React.PointerEvent, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    suppressTap.current = false
    const timer = window.setTimeout(() => {
      categoryPress.current = null
      suppressTap.current = true
      try { navigator.vibrate?.(10) } catch { /* not supported */ }
      setEditingCategoryId(id)
    }, 500)
    categoryPress.current = { id, timer, x: e.clientX, y: e.clientY }
  }
  const pressMove = (e: React.PointerEvent) => {
    const p = categoryPress.current
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) { window.clearTimeout(p.timer); categoryPress.current = null }
  }
  const pressEnd = () => {
    if (categoryPress.current) window.clearTimeout(categoryPress.current.timer)
    categoryPress.current = null
  }
  const tapRow = (id: string) => {
    if (suppressTap.current) { suppressTap.current = false; return }
    toggle(id)
  }

  const toggle = async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return
    const checked = !item.checked
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked } : i))
    // Offline (or changes still waiting): queue it, sent when back online
    if (offline || readQueue().length > 0) {
      queueOp({ kind: 'check', id, checked })
      if (!offline) flush()
      return
    }
    beginMutation()
    const res = await apiCall(`/api/shopping/${id}`, { method: 'PATCH', body: { checked } })
    endMutation()
    if (res.ok) return
    if (res.status === 0) {
      goOffline()
      queueOp({ kind: 'check', id, checked })
      return
    }
    if (res.status === 404) {
      setItems(prev => prev.filter(i => i.id !== id))
      showError(`Inzwischen entfernt: ${item.name}`)
      return
    }
    revertItem(id, { checked: !checked })
    showError('Eintrag konnte nicht geändert werden')
  }

  const changeCategory = async (id: string, category: string) => {
    const previousCategory = items.find(i => i.id === id)?.category
    setItems(prev => prev.map(i => i.id === id ? { ...i, category } : i))
    beginMutation()
    try {
      const res = await fetch(`/api/shopping/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      })
      if (!res.ok) throw new Error('category update failed')
      setEditingCategoryId(null)
    } catch {
      showError('Kategorie konnte nicht geändert werden')
      if (previousCategory !== undefined) revertItem(id, { category: previousCategory })
    } finally {
      endMutation()
    }
  }

  /** Re-create items as they were (used by the Rückgängig toasts). */
  const restoreItems = async (removed: ShoppingItem[], pending: Promise<unknown>) => {
    // Make sure the delete has actually landed before we re-insert,
    // otherwise a fast undo could be wiped out by the still-running delete.
    try { await pending } catch { /* handled by the caller */ }
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', items: removed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !Array.isArray(data.items)) throw new Error('restore failed')
      const restored: ShoppingItem[] = data.items
      if (restored.length === 0) {
        // Nothing was deleted after all (e.g. the delete failed) — just resync
        load(false)
        return
      }
      setItems(prev => {
        const have = new Set(prev.map(i => i.id))
        return [...prev, ...restored.filter(i => !have.has(i.id))]
      })
      showToast(restored.length === 1 ? `Wieder da: ${restored[0].name}` : `${restored.length} Einträge sind wieder da`)
    } catch {
      showError('Wiederherstellen hat nicht geklappt')
      load(false)
    }
  }

  const remove = async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return
    setItems(prev => prev.filter(i => i.id !== id))
    // Offline: an item added offline just leaves the queue, others are removed later
    if (offline || readQueue().some(op => op.id === id)) {
      queueOp({ kind: 'delete', id })
      showToast(`Entfernt: ${item.name}`)
      return
    }
    beginMutation()
    const pending = fetch(`/api/shopping/${id}`, { method: 'DELETE' })
    pending.finally(endMutation).catch(() => {})
    showToast(`Entfernt: ${item.name}`, {
      action: { label: 'Rückgängig', onClick: () => { hideToast(); restoreItems([item], pending) } },
    })
    try {
      const res = await pending
      if (!res.ok) throw new Error('delete failed')
    } catch {
      setItems(prev => prev.some(i => i.id === id) ? prev : [...prev, item])
      showError('Eintrag konnte nicht entfernt werden')
    }
  }

  const clearChecked = async () => {
    const removed = items.filter(i => i.checked)
    if (removed.length === 0) return
    setItems(prev => prev.filter(i => !i.checked))
    beginMutation()
    const pending = fetch('/api/shopping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_checked' }) })
    pending.finally(endMutation).catch(() => {})
    showToast(`${plural(removed.length, 'erledigter Eintrag', 'erledigte Einträge')} entfernt`, {
      action: { label: 'Rückgängig', onClick: () => { hideToast(); restoreItems(removed, pending) } },
    })
    try {
      const res = await pending
      if (!res.ok) throw new Error('clear checked failed')
    } catch {
      setItems(prev => {
        const have = new Set(prev.map(i => i.id))
        return [...prev, ...removed.filter(i => !have.has(i.id))]
      })
      showError('Erledigte konnten nicht entfernt werden')
    }
  }

  const clearAll = async () => {
    if (!confirm('Wirklich die ganze Liste löschen? Das lässt sich nicht rückgängig machen.')) return
    const previous = items
    setItems([])
    beginMutation()
    try {
      const res = await fetch('/api/shopping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_all' }) })
      if (!res.ok) throw new Error('clear all failed')
      showToast('Liste gelöscht')
    } catch {
      setItems(previous)
      showError('Liste konnte nicht gelöscht werden')
    } finally {
      endMutation()
    }
  }

  const addStapleByName = async (name: string): Promise<PantryStaple | null> => {
    try {
      const res = await fetch('/api/pantry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const staple = await res.json().catch(() => ({}))
      if (!res.ok || !staple?.id) throw new Error(staple?.error || 'pantry add failed')
      setStaples(prev => prev.some(s => s.id === staple.id)
        ? prev
        : [...prev, staple].sort((a, b) => a.name.localeCompare(b.name, 'de')))
      return staple
    } catch {
      showError('Konnte nicht zum Vorrat hinzugefügt werden')
      return null
    }
  }

  const addStaple = async () => {
    const name = newStaple.trim()
    if (!name) return
    const staple = await addStapleByName(name)
    if (staple) {
      track('pantry_add', { from: 'pantry_panel' })
      setNewStaple('')
    }
  }

  const removeStaple = async (id: string) => {
    const previous = staples
    setStaples(prev => prev.filter(s => s.id !== id))
    try {
      const res = await fetch(`/api/pantry/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('pantry delete failed')
    } catch {
      setStaples(previous)
      showError('Konnte nicht aus dem Vorrat entfernt werden')
    }
  }

  /** Abgleichen; the result stays visible under the buttons. Without Home Assistant it only explains. */
  const syncList = async () => {
    if (!haReady) {
      setLastSync({ ok: false, setup: true, error: 'Abgleichen bringt die Liste in eure Home-Assistant-Liste (z. B. Google Keep). Home Assistant ist noch nicht eingerichtet.' })
      return
    }
    setSyncing(true)
    const result = await runHaSync()
    setLastSync(result.ok ? (result.data ?? { ok: true }) : { ok: false, error: result.msg, setup: result.setup })
    if (result.ok) {
      await load(false)
      showToast(result.msg ? `Abgeglichen: ${result.msg}` : 'Schon alles abgeglichen')
    }
    setSyncing(false)
  }

  const openReview = () => {
    setMenuOpen(false)
    setShowPantry(false)
    setReviewOpen(true)
  }

  // --- Manual add / copy ------------------------------------------------------

  const addInputRef = useRef<HTMLInputElement | null>(null)

  // Adds one or more items ("Banane, Milch, Brot"). The field stays open and
  // focused so several things can be typed in a row without tapping "+" again.
  // Each item gets its id here, so sending it again (offline queue) can
  // never create a second one.
  const addItem = async () => {
    const names = newItem.split(/[,;\n]+/).map(n => n.trim()).filter(Boolean)
    if (names.length === 0) return
    setNewItem('')
    addInputRef.current?.focus()
    const added: ShoppingItem[] = []
    const failed: string[] = []
    const queued: ShoppingItem[] = []
    let noConnection = offline
    beginMutation()
    for (const name of names) {
      const id = newItemId()
      if (noConnection) {
        queueOp({ kind: 'add', id, name, checked: false })
        queued.push(offlineItem({ id, name, checked: false }))
        continue
      }
      const res = await apiCall<ShoppingItem>('/api/shopping', { method: 'POST', body: { id, name } })
      if (res.ok) added.push(res.data)
      else if (res.status === 0) {
        noConnection = true
        goOffline()
        queueOp({ kind: 'add', id, name, checked: false })
        queued.push(offlineItem({ id, name, checked: false }))
      } else failed.push(name)
    }
    endMutation()
    if (added.length > 0 || queued.length > 0) {
      setItems(prev => [...prev, ...added, ...queued.filter(q => !prev.some(i => i.id === q.id))])
      track('shopping_manual_add', { count: added.length + queued.length, offline: queued.length })
    }
    if (queued.length > 0 && failed.length === 0) {
      showToast(queued.length === 1 ? `${queued[0].name} kommt auf die Liste, sobald wieder Verbindung da ist` : `${queued.length} Einträge kommen auf die Liste, sobald wieder Verbindung da ist`)
    } else if (failed.length > 0) {
      setNewItem(failed.join(', '))
      showError(`Nicht hinzugefügt: ${failed.join(', ')}`)
    } else if (added.length === 1) {
      showToast(`${added[0].name} → ${CATEGORY_LABELS[added[0].category] || added[0].category}`)
    } else if (added.length > 1) {
      showToast(`${added.length} Einträge hinzugefügt`)
    }
  }

  const displayCategoryOrder = Array.from(new Set([
    ...categoryOrder,
    ...DEFAULT_CATEGORY_ORDER,
    ...Array.from(new Set(items.map(i => i.category))).filter(cat => !categoryOrder.includes(cat)),
  ]))

  const copyList = async () => {
    setMenuOpen(false)
    const unchecked = items.filter(i => !i.checked)
    if (unchecked.length === 0) { showToast('Nichts zu kopieren – die Liste ist leer'); return }
    const text = displayCategoryOrder.flatMap(cat => {
      const catItems = unchecked.filter(i => i.category === cat)
      if (!catItems.length) return []
      return [
        CATEGORY_LABELS[cat] || cat,
        ...catItems.map(i => `• ${[i.amount, i.unit, i.name].filter(Boolean).join(' ')}`),
        '',
      ]
    }).join('\n')
    try {
      await navigator.clipboard.writeText(text.trim())
      showToast('Liste kopiert')
    } catch {
      showError('Kopieren hat nicht geklappt')
    }
  }

  const showSearch = items.length > SEARCH_THRESHOLD
  const query = search.trim().toLowerCase()
  const visibleItems = useMemo(() => {
    if (!showSearch || !query) return items
    return items.filter(i =>
      i.name.toLowerCase().includes(query) ||
      (i.recipe_names ?? []).some(n => n.toLowerCase().includes(query))
    )
  }, [items, query, showSearch])

  const grouped = displayCategoryOrder.reduce<Record<string, ShoppingItem[]>>((acc, cat) => {
    const catItems = visibleItems.filter(i => i.category === cat)
    if (catItems.length) acc[cat] = catItems
    return acc
  }, {})

  const checkedCount = items.filter(i => i.checked).length
  const totalCount = items.length
  const openCount = totalCount - checkedCount

  const iconBtn = 'w-10 h-10 flex items-center justify-center rounded-lg transition-colors'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white">Einkauf</h1>
            <p className="text-sm text-[#9a9a9a] mt-0.5">
              {loadError ? 'Nicht geladen' : loading ? '\u00a0' : totalCount === 0 ? 'Liste ist leer' : `${openCount} offen${checkedCount > 0 ? ` · ${checkedCount} erledigt` : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="relative">
              <button
                onClick={() => setMenuOpen(o => !o)}
                aria-label="Weitere Aktionen"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={`${iconBtn} border border-[#2a2a2a] ${menuOpen ? 'bg-[#252525] text-white' : 'bg-[#1c1c1c] text-[#d0d0d0] hover:text-white hover:bg-[#252525]'}`}
              >
                <MoreHorizontal size={18} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                  <div
                    role="menu"
                    className="absolute right-0 top-12 z-50 w-56 py-1 rounded-xl bg-[#1a1a1a] border border-[#2e2e2e] shadow-2xl animate-slide-up"
                  >
                    <button
                      role="menuitem"
                      onClick={copyList}
                      className="w-full min-h-[44px] flex items-center gap-3 px-4 text-sm text-[#e5e5e5] hover:bg-[#252525]"
                    >
                      <Copy size={16} className="text-[#9a9a9a]" />
                      Liste kopieren
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); setShowPantry(true) }}
                      className="w-full min-h-[44px] flex items-center gap-3 px-4 text-sm text-[#e5e5e5] hover:bg-[#252525]"
                    >
                      <Package size={16} className="text-[#9a9a9a]" />
                      Vorrat verwalten
                    </button>
                    {totalCount > 0 && (
                      <button
                        role="menuitem"
                        onClick={() => { setMenuOpen(false); clearAll() }}
                        className="w-full min-h-[44px] flex items-center gap-3 px-4 text-sm text-red-300 hover:bg-[#252525] border-t border-[#2a2a2a]"
                      >
                        <Trash2 size={16} className="text-red-300/80" />
                        Alles löschen
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-stretch gap-2">
          <button
            onClick={openReview}
            className="flex-1 min-h-[48px] flex items-center justify-center gap-2 px-4 rounded-xl bg-primary-solid hover:bg-primary-solidHover text-white text-base font-semibold transition-colors"
          >
            <ListPlus size={19} />
            Zutaten der Woche
          </button>
          <button
            onClick={syncList}
            disabled={syncing}
            aria-label="Mit Home Assistant abgleichen"
            title="Mit Home Assistant abgleichen"
            className={`min-h-[48px] flex items-center gap-2 px-3.5 rounded-xl border text-sm transition-colors disabled:opacity-70 ${
              haReady
                ? 'bg-[#1c1c1c] hover:bg-[#252525] border-[#2a2a2a] text-[#d0d0d0] hover:text-white'
                : 'bg-transparent border-dashed border-[#2a2a2a] text-ink-hint'
            }`}
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            <span>Abgleichen</span>
          </button>
        </div>

        {/* Offline or not up to date: which state the list shows, what still waits */}
        {!loadError && (offline || staleAt !== null || queue.length > 0) && (
          <div role="status" className="flex items-center gap-2 min-h-[40px] rounded-lg border border-amber-500/25 bg-amber-500/10 pl-3 pr-1 py-1 text-xs text-amber-200">
            <span className="flex-1 min-w-0">
              {offline ? 'Offline' : staleAt !== null ? 'Nicht aktuell' : 'Wird gesendet …'}
              {staleAt !== null && ` · Stand ${standLabel(staleAt)}`}
              {queue.length > 0 && ` · ${changes(queue.length)} ${offline ? 'warten' : 'noch nicht gesendet'}`}
            </span>
            {staleAt !== null && (
              <button type="button" onClick={() => reload()}
                className="flex-shrink-0 min-h-[36px] px-2.5 rounded-md font-semibold text-amber-100 hover:bg-amber-500/15">
                Erneut laden
              </button>
            )}
          </div>
        )}

        {lastSync && (
          <div role={lastSync.ok || lastSync.setup ? 'status' : 'alert'} className={`flex items-center gap-2 rounded-lg border pl-3 pr-1 py-1 text-xs ${
            lastSync.ok ? 'border-[#243525] bg-[#101810] text-[#9fb8a1]'
              : lastSync.setup ? 'border-[#2a2a2a] bg-[#141414] text-ink-soft'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}>
            <p className="flex-1 min-w-0 py-1">
              {lastSync.ok ? `Zuletzt abgeglichen: ${syncSummary(lastSync) || 'nichts Neues'}` : lastSync.error}
            </p>
            {lastSync.setup && (
              <Link href="/settings#ha" className="flex-shrink-0 min-h-[40px] flex items-center px-2.5 rounded-md font-semibold text-primary hover:bg-[#1c1c1c]">
                Einstellungen öffnen
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Quick add — always visible, stays focused after Enter, commas add several */}
      <form
        onSubmit={e => { e.preventDefault(); addItem() }}
        className="flex gap-2"
      >
        <input
          ref={addInputRef}
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          placeholder="Was fehlt? z. B. Banane, Milch"
          className="flex-1 min-h-[48px]"
          enterKeyHint="enter"
          autoComplete="off"
          aria-label="Eintrag hinzufügen"
        />
        <button
          type="submit"
          disabled={!newItem.trim()}
          aria-label="Auf die Liste"
          className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded-lg bg-primary-solid hover:bg-primary-solidHover text-white transition-colors disabled:bg-bg-border disabled:text-ink-hint disabled:shadow-none"
        >
          <Plus size={20} />
        </button>
      </form>

      {/* Pantry staples panel */}
      {showPantry && (
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4 space-y-3 animate-slide-up">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">Vorrat</p>
              <p className="text-xs text-[#9a9a9a] mt-0.5">Immer im Haus, wird bei „Zutaten der Woche“ nicht vorausgewählt.</p>
            </div>
            <button
              onClick={() => setShowPantry(false)}
              aria-label="Vorrat schließen"
              className={`${iconBtn} -mr-2 -mt-2 text-[#9a9a9a] hover:text-white`}
            >
              <X size={16} />
            </button>
          </div>
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); addStaple() }}>
            <input
              value={newStaple}
              onChange={e => setNewStaple(e.target.value)}
              placeholder="z. B. Olivenöl, Knoblauch …"
              className="flex-1 min-h-[44px]"
              aria-label="Neuer Vorrat"
              enterKeyHint="done"
            />
            <button
              type="submit"
              className="px-4 min-h-[44px] rounded-lg bg-primary-solid hover:bg-primary-solidHover text-white text-sm font-medium transition-colors"
            >
              Hinzufügen
            </button>
          </form>
          {staples.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {staples.map(s => (
                <span key={s.id} className="flex items-center pl-3 rounded-full bg-[#1e1e1e] border border-[#2a2a2a] text-sm text-[#d0d0d0]">
                  {s.name}
                  <button
                    onClick={() => removeStaple(s.id)}
                    aria-label={`„${s.name}“ aus dem Vorrat entfernen`}
                    className="w-10 h-10 flex items-center justify-center text-[#8a8a8a] hover:text-red-400 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#8a8a8a]">Noch nichts im Vorrat – z. B. Öl, Gewürze, Reis.</p>
          )}
        </div>
      )}

      {/* Progress, once something is checked off */}
      {checkedCount > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-[#1c1c1c] rounded-full overflow-hidden" role="progressbar"
            aria-valuemin={0} aria-valuemax={totalCount} aria-valuenow={checkedCount} aria-label="Erledigt">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${(checkedCount / totalCount) * 100}%` }}
            />
          </div>
          <span className="flex-shrink-0 text-xs text-ink-muted tabular-nums">{checkedCount} von {totalCount}</span>
        </div>
      )}

      {/* Search / filter — only worth showing on longer lists */}
      {!loading && showSearch && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8a8a] pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Nach Zutat oder Gericht filtern …"
            aria-label="Einkaufsliste filtern"
            className="w-full pl-9 pr-11 min-h-[44px]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Filter löschen"
              className={`${iconBtn} absolute right-0.5 top-1/2 -translate-y-1/2 text-[#9a9a9a] hover:text-white`}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
        </div>
      ) : loadError ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">📡</div>
          <p className="text-[#d0d0d0]">Die Liste konnte nicht geladen werden</p>
          <p className="text-sm text-[#8a8a8a] mt-1">
            {offline ? 'Keine Verbindung, und auf diesem Handy ist noch keine Liste gespeichert.' : 'Vommeal antwortet gerade nicht.'}
          </p>
          <button type="button" onClick={() => reload(true)}
            className="mt-4 min-h-[44px] px-5 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-sm font-medium text-white transition-colors">
            Erneut laden
          </button>
        </div>
      ) : totalCount === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">🛒</div>
          <p className="text-[#b5b5b5]">Die Liste ist leer</p>
          <p className="text-sm text-[#8a8a8a] mt-1">Tippe auf „Zutaten der Woche“ oder füge mit + etwas hinzu.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.keys(grouped).length === 0 && (
            <div className="text-center py-10">
              <p className="text-[#9a9a9a] text-sm">Nichts passt zu „{search.trim()}“</p>
            </div>
          )}
          {Object.entries(grouped).map(([cat, catItems]) => {
            const isCollapsed = collapsed.has(cat)
            const doneCount = catItems.filter(i => i.checked).length
            return (
              <div key={cat} className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden">
                <button
                  onClick={() => setCollapsed(prev => {
                    const next = new Set(prev)
                    if (next.has(cat)) next.delete(cat)
                    else next.add(cat)
                    return next
                  })}
                  aria-expanded={!isCollapsed}
                  className="w-full min-h-[44px] flex items-center justify-between px-4 py-2.5 hover:bg-[#191919] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{CATEGORY_LABELS[cat] || cat}</span>
                    <span className="text-xs text-[#8a8a8a]">{doneCount}/{catItems.length}</span>
                  </div>
                  {isCollapsed ? <ChevronRight size={16} className="text-[#8a8a8a]" /> : <ChevronDown size={16} className="text-[#8a8a8a]" />}
                </button>
                {!isCollapsed && (
                  <div className="border-t border-[#1e1e1e]">
                    {[...catItems].sort((a, b) => (a.checked ? 1 : 0) - (b.checked ? 1 : 0)).map((item, idx, arr) => {
                      const meals = mealsLabel(item.recipe_names)
                      return (
                        <div
                          key={item.id}
                          className={`flex flex-wrap items-center gap-1 pl-1.5 pr-1.5 py-1 ${
                            idx < arr.length - 1 ? 'border-b border-[#1a1a1a]' : ''
                          }`}
                        >
                          <button
                            onClick={() => toggle(item.id)}
                            // Keyboard: the context-menu key (or Shift+F10) opens the category
                            onContextMenu={e => { e.preventDefault(); if (!item.checked) setEditingCategoryId(item.id) }}
                            aria-label={item.checked ? `„${item.name}“ wieder offen` : `„${item.name}“ abhaken`}
                            className="w-10 h-10 flex-shrink-0 flex items-center justify-center"
                          >
                            <span className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-all ${
                              item.checked ? 'bg-primary border-primary' : 'border-[#6b6b6b] hover:border-primary'
                            }`}>
                              {item.checked && <Check size={12} className="text-white" strokeWidth={3} />}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => tapRow(item.id)}
                            onPointerDown={e => pressStart(e, item.id)}
                            onPointerMove={pressMove}
                            onPointerUp={pressEnd}
                            onPointerCancel={pressEnd}
                            onContextMenu={e => { e.preventDefault(); pressEnd(); if (!item.checked) setEditingCategoryId(item.id) }}
                            tabIndex={-1}
                            className="flex-1 min-w-0 min-h-[40px] flex flex-col justify-center text-left py-1.5 select-none [-webkit-touch-callout:none]"
                          >
                            <span className={`block text-[15px] leading-snug ${item.checked ? 'line-through text-[#8a8a8a]' : 'text-white'}`}>
                              {item.name}
                              {(item.amount || item.unit) && (
                                <span className="text-sm text-[#b5b5b5] ml-2">
                                  {[item.amount, item.unit].filter(Boolean).join(' ')}
                                </span>
                              )}
                            </span>
                            {meals && (
                              <span className={`block text-[13px] leading-snug mt-0.5 line-clamp-2 ${item.checked ? 'text-[#7a7a7a]' : 'text-[#9a9a9a]'}`}>
                                {meals}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => remove(item.id)}
                            aria-label={`„${item.name}“ entfernen`}
                            className={`${iconBtn} relative after:absolute after:-inset-0.5 text-ink-hint hover:text-red-400 hover:bg-[#1c1c1c]`}
                          >
                            <X size={15} />
                          </button>
                          {editingCategoryId === item.id && (
                            <div className="basis-full flex items-center gap-1 pl-11 pr-0 pb-2">
                              <select
                                value={item.category}
                                onChange={e => changeCategory(item.id, e.target.value)}
                                aria-label={`Kategorie von „${item.name}“`}
                                autoFocus
                                className="flex-1 min-w-0 min-h-[44px] bg-[#101010] border-[#2a2a2a] text-[#d0d0d0]"
                              >
                                {CATEGORIES.map(c => (
                                  <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
                                ))}
                              </select>
                              <button type="button" onClick={() => setEditingCategoryId(null)} aria-label="Kategorie nicht ändern"
                                className={`${iconBtn} flex-shrink-0 text-ink-muted hover:text-white`}>
                                <X size={15} />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Clear actions */}
          <p className="text-xs text-ink-hint text-center">Eintrag lange drücken, um die Kategorie zu ändern</p>

          {checkedCount > 0 && (
            <button
              onClick={clearChecked}
              className="w-full min-h-[44px] rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-sm text-[#b5b5b5] hover:text-white transition-colors"
            >
              {plural(checkedCount, 'Erledigten', 'Erledigte')} entfernen
            </button>
          )}
        </div>
      )}

      {/* Zutaten der Woche */}
      {reviewOpen && (
        <WeekIngredientsSheet
          start={todayIso()}
          end={endOfNextWeek()}
          source="shopping"
          categoryOrder={categoryOrder}
          onClose={() => setReviewOpen(false)}
          onChanged={() => load(false)}
          onPantryAdd={staple => setStaples(prev => prev.some(s => s.id === staple.id)
            ? prev
            : [...prev, staple].sort((a, b) => a.name.localeCompare(b.name, 'de')))}
          onSynced={setLastSync}
        />
      )}
    </div>
  )
}
