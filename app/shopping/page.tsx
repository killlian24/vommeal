'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Check, Plus, Copy, RefreshCw, ChevronDown, ChevronRight, X, Moon, Package, Tags, Search } from 'lucide-react'
import { format, startOfWeek, addDays } from 'date-fns'

type ShoppingItem = {
  id: string; name: string; amount: string; unit: string
  category: string; checked: boolean; source: string
  meal_plan_id?: string | null; ha_uid?: string | null; sort_order?: number
  recipe_name?: string | null
}
type PantryStaple = { id: string; name: string }
type SyncResult = {
  ok: boolean
  imported?: number
  linked?: number
  pushed?: number
  checked?: number
  sorted?: number
  needsCategory?: number
  restored?: number
  error?: string
}

type Toast = {
  msg: string
  action?: { label: string; onClick: () => void }
}

const CATEGORY_LABELS: Record<string, string> = {
  produce: '🥦 Produce',
  meat: '🥩 Meat & Fish',
  dairy: '🧀 Dairy & Eggs',
  bakery: '🍞 Bakery & Pasta',
  pantry: '🫙 Pantry',
  frozen: '🧊 Frozen',
  beverages: '🥤 Beverages',
  other: '📦 Other',
}

const DEFAULT_categoryOrder = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other']
const CATEGORIES = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other']

const UNDO_MS = 6000
const ERROR_MS = 6000
const SEARCH_THRESHOLD = 8

export default function ShoppingPage() {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [categoryOrder, setCategoryOrder] = useState<string[]>(DEFAULT_categoryOrder)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [addingTonight, setAddingTonight] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [newItem, setNewItem] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showPantry, setShowPantry] = useState(false)
  const [staples, setStaples] = useState<PantryStaple[]>([])
  const [newStaple, setNewStaple] = useState('')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<SyncResult | null>(null)

  const hideToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = null
    setToast(null)
  }

  const showToast = (msg: string, opts: { duration?: number; action?: Toast['action'] } = {}) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, action: opts.action })
    toastTimer.current = setTimeout(() => {
      toastTimer.current = null
      setToast(null)
    }, opts.duration ?? 2500)
  }

  // Clear any pending toast timer on unmount
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const load = async (showSkeleton = true) => {
    if (showSkeleton) setLoading(true)
    try {
      const res = await fetch('/api/shopping')
      if (!res.ok) throw new Error('shopping load failed')
      setItems(await res.json())
    } catch {
      showToast('Could not load shopping list', { duration: ERROR_MS })
    } finally {
      setLoading(false)
    }
  }

  const loadStaples = async () => {
    const res = await fetch('/api/pantry')
    setStaples(await res.json())
  }

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(s => {
      if (s.category_order) {
        try { setCategoryOrder(JSON.parse(s.category_order)) } catch { /* use default */ }
      }
    }).catch(() => { /* keep default order */ })
    load()
    loadStaples()
  }, [])

  const toggle = async (id: string) => {
    const previous = items
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i))
    try {
      const res = await fetch(`/api/shopping/${id}`, { method: 'PATCH' })
      if (!res.ok) throw new Error('toggle failed')
    } catch {
      setItems(previous)
      showToast('Could not update item')
    }
  }

  const changeCategory = async (id: string, category: string) => {
    const previous = items
    setItems(prev => prev.map(i => i.id === id ? { ...i, category } : i))
    try {
      const res = await fetch(`/api/shopping/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      })
      if (!res.ok) throw new Error('category update failed')
      setEditingCategoryId(null)
    } catch {
      showToast('Could not update category')
      setItems(previous)
    }
  }

  /** Re-create items as they were (used by the Undo toasts). */
  const restoreItems = async (removed: ShoppingItem[], pending: Promise<unknown>) => {
    // Make sure the delete has actually landed before we re-insert,
    // otherwise a fast Undo could be wiped out by the still-running delete.
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
      showToast(restored.length === 1 ? `Restored ${restored[0].name}` : `Restored ${restored.length} items`)
    } catch {
      showToast('Could not restore items', { duration: ERROR_MS })
      load(false)
    }
  }

  const remove = async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return
    const previous = items
    setItems(prev => prev.filter(i => i.id !== id))
    const pending = fetch(`/api/shopping/${id}`, { method: 'DELETE' })
    showToast(`Removed ${item.name}`, {
      duration: UNDO_MS,
      action: { label: 'Undo', onClick: () => { hideToast(); restoreItems([item], pending) } },
    })
    try {
      const res = await pending
      if (!res.ok) throw new Error('delete failed')
    } catch {
      setItems(previous)
      showToast('Could not remove item', { duration: ERROR_MS })
    }
  }

  const clearChecked = async () => {
    const removed = items.filter(i => i.checked)
    if (removed.length === 0) return
    const previous = items
    setItems(prev => prev.filter(i => !i.checked))
    const pending = fetch('/api/shopping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_checked' }) })
    showToast(`Cleared ${removed.length} checked item${removed.length === 1 ? '' : 's'}`, {
      duration: UNDO_MS,
      action: { label: 'Undo', onClick: () => { hideToast(); restoreItems(removed, pending) } },
    })
    try {
      const res = await pending
      if (!res.ok) throw new Error('clear checked failed')
    } catch {
      setItems(previous)
      showToast('Could not clear checked items', { duration: ERROR_MS })
    }
  }

  const clearAll = async () => {
    if (!confirm('Clear all items?')) return
    const previous = items
    setItems([])
    try {
      const res = await fetch('/api/shopping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_all' }) })
      if (!res.ok) throw new Error('clear all failed')
      showToast('Shopping list cleared')
    } catch {
      setItems(previous)
      showToast('Could not clear shopping list', { duration: ERROR_MS })
    }
  }

  const addTonight = async () => {
    setAddingTonight(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_date', date: today }),
      })
      const data = await res.json()
      if (data.added > 0) {
        showToast(`Added ${data.added} ingredients for tonight`)
        load(false)
      } else {
        showToast('Nothing to add — no dinner planned or already on list')
      }
    } catch {
      showToast('Could not add tonight\'s ingredients', { duration: ERROR_MS })
    }
    setAddingTonight(false)
  }

  const addStaple = async () => {
    if (!newStaple.trim()) return
    const res = await fetch('/api/pantry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newStaple.trim() }),
    })
    const staple = await res.json()
    setStaples(prev => [...prev, staple].sort((a, b) => a.name.localeCompare(b.name)))
    setNewStaple('')
  }

  const removeStaple = async (id: string) => {
    setStaples(prev => prev.filter(s => s.id !== id))
    await fetch(`/api/pantry/${id}`, { method: 'DELETE' })
  }

  const generate = async () => {
    setGenerating(true)
    // Start from today (never past days); end at the end of the current week
    const now = new Date()
    const weekStart = startOfWeek(now, { weekStartsOn: 1 })
    const start = format(now, 'yyyy-MM-dd')
    const weekEnd = format(addDays(weekStart, 6), 'yyyy-MM-dd')
    const end = weekEnd < start ? start : weekEnd
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', start, end }),
      })
      const data = await res.json()
      showToast(
        data.ok ? `Added ${data.added} ingredients from the rest of this week` : `Error: ${data.error}`,
        { duration: data.ok ? 2500 : ERROR_MS },
      )
      load(false)
    } catch {
      showToast('Could not generate from plan', { duration: ERROR_MS })
    }
    setGenerating(false)
  }

  const syncList = async (silent = false) => {
    setSyncing(true)
    try {
      const res = await fetch('/api/ha/sync', { method: 'POST' })
      let data: SyncResult & { added?: number } = { ok: false }
      let bodyText = ''
      try {
        bodyText = await res.text()
        data = JSON.parse(bodyText)
      } catch { /* non-JSON error body (e.g. HTML from a proxy) */ }
      if (res.ok && data.ok) {
        setLastSync(data)
        const changed = (data.imported ?? data.added ?? 0) + (data.linked ?? 0) + (data.pushed ?? 0) + (data.checked ?? 0) + (data.sorted ?? 0)
        if (changed > 0) {
          await load(false)
          const parts = []
          if ((data.imported ?? data.added ?? 0) > 0) parts.push(`${data.imported ?? data.added} imported`)
          if ((data.pushed ?? 0) > 0) parts.push(`${data.pushed} sent to HA`)
          if ((data.linked ?? 0) > 0) parts.push(`${data.linked} linked`)
          if ((data.checked ?? 0) > 0) parts.push(`${data.checked} checked off`)
          if ((data.sorted ?? 0) > 0) parts.push('sorted')
          if ((data.needsCategory ?? 0) > 0) parts.push(`${data.needsCategory} need category`)
          if (!silent) showToast(`Synced: ${parts.join(', ')}`)
        } else if (!silent) showToast('Nothing new on your list')
      } else {
        const rawReason = data.error
          ? String(data.error)
          : bodyText.trim() && !/^\s*</.test(bodyText) ? bodyText.trim().slice(0, 160) : `HTTP ${res.status}`
        const reason = rawReason
          .replace(/^Cannot reach Home Assistant:\s*/i, '')
          .replace(/^TypeError:\s*/i, '')
        const headline = res.status === 503 || /fetch failed|ECONN|ENOTFOUND|timeout|unreachable/i.test(reason)
          ? 'Sync failed — Home Assistant unreachable'
          : 'Sync failed'
        setLastSync({ ok: false, error: reason })
        if (!silent) showToast(`${headline}: ${reason}`, { duration: ERROR_MS })
      }
    } catch {
      setLastSync({ ok: false, error: 'Sync failed — check Settings' })
      if (!silent) showToast('Sync failed — check Settings', { duration: ERROR_MS })
    }
    setSyncing(false)
  }

  const addItem = async () => {
    const name = newItem.trim()
    if (!name) return
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, amount: newAmount.trim() }),
      })
      const item = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(item.error || 'Could not add item', { duration: ERROR_MS })
        return
      }
      setItems(prev => [...prev, item])
      setNewItem(''); setNewAmount(''); setShowAdd(false)
    } catch {
      showToast('Could not add item', { duration: ERROR_MS })
    }
  }

  const copyList = () => {
    const unchecked = items.filter(i => !i.checked)
    const text = displayCategoryOrder.flatMap(cat => {
      const catItems = unchecked.filter(i => i.category === cat)
      if (!catItems.length) return []
      return [
        CATEGORY_LABELS[cat] || cat,
        ...catItems.map(i => `• ${[i.amount, i.unit, i.name].filter(Boolean).join(' ')}`),
        '',
      ]
    }).join('\n')
    navigator.clipboard.writeText(text.trim())
    showToast('Copied to clipboard!')
  }

  const displayCategoryOrder = Array.from(new Set([
    ...categoryOrder,
    ...Array.from(new Set(items.map(i => i.category))).filter(cat => !categoryOrder.includes(cat)),
  ]))

  const showSearch = items.length > SEARCH_THRESHOLD
  const query = search.trim().toLowerCase()
  const visibleItems = useMemo(() => {
    if (!showSearch || !query) return items
    return items.filter(i =>
      i.name.toLowerCase().includes(query) ||
      (i.recipe_name ?? '').toLowerCase().includes(query)
    )
  }, [items, query, showSearch])

  const grouped = displayCategoryOrder.reduce<Record<string, ShoppingItem[]>>((acc, cat) => {
    const catItems = visibleItems.filter(i => i.category === cat)
    if (catItems.length) acc[cat] = catItems
    return acc
  }, {})

  const checkedCount = items.filter(i => i.checked).length
  const totalCount = items.length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-3">
        {/* Row 1: title + count */}
        <div>
          <h1 className="text-2xl font-bold text-white">Shopping List</h1>
          <p className="text-sm text-[#666] mt-0.5">
            {checkedCount}/{totalCount} items checked
          </p>
        </div>
        {/* Row 2: action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => syncList(false)}
            disabled={syncing}
            title="Sync with Home Assistant"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-xs text-[#888] hover:text-white transition-all"
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            Sync
          </button>
          <button
            onClick={addTonight}
            disabled={addingTonight}
            title="Add tonight's ingredients"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-xs text-[#888] hover:text-white transition-all"
          >
            <Moon size={13} className={addingTonight ? 'animate-pulse' : ''} />
            Tonight
          </button>
          <button
            onClick={generate}
            disabled={generating}
            title="Generate from today to the end of this week"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-xs text-[#888] hover:text-white transition-all"
          >
            <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
            From plan
          </button>
          <button
            onClick={() => { setShowAdd(false); setShowPantry(p => !p) }}
            title="Pantry staples"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
              showPantry
                ? 'bg-primary/15 border-primary/30 text-primary'
                : 'bg-[#1c1c1c] hover:bg-[#252525] border-[#2a2a2a] text-[#888] hover:text-white'
            }`}
          >
            <Package size={13} />
            Pantry
          </button>
          <button
            onClick={copyList}
            title="Copy list to clipboard"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-xs text-[#888] hover:text-white transition-all"
          >
            <Copy size={13} />
            Copy
          </button>
          <button
            onClick={() => { setShowPantry(false); setShowAdd(a => !a) }}
            title={showAdd ? 'Close' : 'Add item'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-medium transition-all ml-auto"
          >
            {showAdd ? <X size={14} /> : <Plus size={14} />}
          </button>
        </div>
        {lastSync && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${
            lastSync.ok ? 'border-[#243525] bg-[#101810] text-[#8da58f]' : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}>
            {lastSync.ok ? (
              <p>
                Last sync: {[
                  lastSync.imported ? `${lastSync.imported} imported` : '',
                  lastSync.pushed ? `${lastSync.pushed} sent to HA` : '',
                  lastSync.linked ? `${lastSync.linked} linked` : '',
                  lastSync.checked ? `${lastSync.checked} checked` : '',
                  lastSync.sorted ? 'HA sorted' : '',
                  lastSync.needsCategory ? `${lastSync.needsCategory} need category` : '',
                ].filter(Boolean).join(', ') || 'no changes'}
              </p>
            ) : (
              <p>Last sync failed: {lastSync.error}</p>
            )}
          </div>
        )}
      </div>

      {/* Add item — a real form so Enter (and the mobile keyboard's Go/Done) submits */}
      {showAdd && (
        <form
          onSubmit={e => { e.preventDefault(); addItem() }}
          className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4 space-y-3 animate-slide-up"
        >
          <div className="flex gap-2">
            <input
              value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              placeholder="500g"
              className="w-20"
              enterKeyHint="done"
              aria-label="Amount"
            />
            <input
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              placeholder="Item name"
              className="flex-1"
              autoFocus
              enterKeyHint="done"
              aria-label="Item name"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all"
          >
            Add to list
          </button>
        </form>
      )}

      {/* Pantry staples panel */}
      {showPantry && (
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4 space-y-3 animate-slide-up">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Pantry Staples</p>
              <p className="text-xs text-[#555] mt-0.5">These are skipped when generating your list</p>
            </div>
            <button onClick={() => setShowPantry(false)} className="p-1 text-[#555] hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={newStaple}
              onChange={e => setNewStaple(e.target.value)}
              placeholder="e.g. olive oil, salt, garlic…"
              className="flex-1 text-sm"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStaple() } }}
              autoFocus
            />
            <button
              onClick={addStaple}
              className="px-3 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all"
            >
              Add
            </button>
          </div>
          {staples.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {staples.map(s => (
                <span key={s.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1e1e1e] border border-[#2a2a2a] text-xs text-[#aaa]">
                  {s.name}
                  <button onClick={() => removeStaple(s.id)} className="text-[#555] hover:text-red-400 transition-colors">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#444]">No staples yet — add things you always have at home</p>
          )}
        </div>
      )}

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="h-1.5 bg-[#1c1c1c] rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${(checkedCount / totalCount) * 100}%` }}
          />
        </div>
      )}

      {/* Search / filter — only worth showing on longer lists */}
      {!loading && showSearch && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by item or meal…"
            aria-label="Filter shopping list"
            className="w-full pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#555] hover:text-white transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
        </div>
      ) : totalCount === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">🛒</div>
          <p className="text-[#555]">Your list is empty</p>
          <p className="text-xs text-[#444] mt-1">Add items manually or generate from this week's meal plan</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.keys(grouped).length === 0 && (
            <div className="text-center py-10">
              <p className="text-[#555] text-sm">Nothing matches “{search.trim()}”</p>
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
                    next.has(cat) ? next.delete(cat) : next.add(cat)
                    return next
                  })}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#191919] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{CATEGORY_LABELS[cat] || cat}</span>
                    <span className="text-xs text-[#555]">{doneCount}/{catItems.length}</span>
                  </div>
                  {isCollapsed ? <ChevronRight size={14} className="text-[#555]" /> : <ChevronDown size={14} className="text-[#555]" />}
                </button>
                {!isCollapsed && (
                  <div className="border-t border-[#1e1e1e]">
                    {[...catItems].sort((a, b) => (a.checked ? 1 : 0) - (b.checked ? 1 : 0)).map((item, idx, arr) => (
                      <div
                        key={item.id}
                        className={`flex flex-wrap items-center gap-3 px-4 py-3 transition-colors ${
                          idx < arr.length - 1 ? 'border-b border-[#1a1a1a]' : ''
                        } ${item.checked ? 'opacity-40' : ''}`}
                      >
                        <button
                          onClick={() => toggle(item.id)}
                          aria-label={item.checked ? `Uncheck ${item.name}` : `Check ${item.name}`}
                          className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                            item.checked
                              ? 'bg-primary border-primary'
                              : 'border-[#3a3a3a] hover:border-primary'
                          }`}
                        >
                          {item.checked && <Check size={10} className="text-white" strokeWidth={3} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div>
                            <span className={`text-sm ${item.checked ? 'line-through text-[#555]' : 'text-white'}`}>
                              {item.name}
                            </span>
                            {(item.amount || item.unit) && (
                              <span className="text-xs text-primary ml-2">
                                {[item.amount, item.unit].filter(Boolean).join(' ')}
                              </span>
                            )}
                          </div>
                          {item.recipe_name && (
                            <p className="text-[11px] text-[#555] truncate mt-0.5">{item.recipe_name}</p>
                          )}
                          <p className="text-[10px] text-[#444] mt-0.5">{CATEGORY_LABELS[item.category] || item.category}</p>
                        </div>
                        <button
                          onClick={() => setEditingCategoryId(editingCategoryId === item.id ? null : item.id)}
                          disabled={item.checked}
                          title="Change category"
                          aria-label="Change category"
                          className="p-2 rounded-lg text-[#444] hover:text-primary hover:bg-[#1c1c1c] disabled:opacity-30 transition-colors"
                        >
                          <Tags size={13} />
                        </button>
                        <button
                          onClick={() => remove(item.id)}
                          aria-label={`Remove ${item.name}`}
                          className="text-[#333] hover:text-red-400 transition-colors p-2"
                        >
                          <X size={13} />
                        </button>
                        {editingCategoryId === item.id && (
                          <div className="basis-full pl-8 pt-2">
                            <select
                              value={item.category}
                              onChange={e => changeCategory(item.id, e.target.value)}
                              className="w-full text-sm py-2 bg-[#101010] border-[#242424] text-[#aaa]"
                            >
                              {CATEGORIES.map(c => (
                                <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Clear actions */}
          {checkedCount > 0 && (
            <div className="flex gap-2">
              <button
                onClick={clearChecked}
                className="flex-1 py-2 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-xs text-[#666] hover:text-white transition-all"
              >
                Clear {checkedCount} checked
              </button>
              <button
                onClick={clearAll}
                className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs text-red-400 transition-all"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 w-max max-w-[calc(100vw-2rem)] px-4 py-2.5 bg-[#1e1e1e] border border-[#333] rounded-lg text-sm text-white shadow-xl animate-slide-up whitespace-normal"
        >
          <span className="min-w-0 break-words">{toast.msg}</span>
          {toast.action && (
            <button
              type="button"
              onClick={toast.action.onClick}
              className="flex-shrink-0 text-primary font-semibold hover:underline"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
