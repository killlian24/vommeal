'use client'

import { useState, useEffect } from 'react'
import { Check, Plus, Copy, RefreshCw, ChevronDown, ChevronRight, X, Moon, Package, Tags } from 'lucide-react'
import { format, startOfWeek, addDays } from 'date-fns'

type ShoppingItem = {
  id: string; name: string; amount: string; unit: string
  category: string; checked: boolean; source: string
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
  const [toastMsg, setToastMsg] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<SyncResult | null>(null)

  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 2500) }

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/shopping')
      if (!res.ok) throw new Error('shopping load failed')
      setItems(await res.json())
    } catch {
      showToast('Could not load shopping list')
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
    })
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

  const remove = async (id: string) => {
    const previous = items
    setItems(prev => prev.filter(i => i.id !== id))
    try {
      const res = await fetch(`/api/shopping/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
    } catch {
      setItems(previous)
      showToast('Could not remove item')
    }
  }

  const clearChecked = async () => {
    const previous = items
    setItems(prev => prev.filter(i => !i.checked))
    try {
      const res = await fetch('/api/shopping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_checked' }) })
      if (!res.ok) throw new Error('clear checked failed')
      showToast('Cleared checked items')
    } catch {
      setItems(previous)
      showToast('Could not clear checked items')
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
      showToast('Could not clear shopping list')
    }
  }

  const addTonight = async () => {
    setAddingTonight(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const res = await fetch('/api/shopping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_date', date: today }),
    })
    const data = await res.json()
    setAddingTonight(false)
    if (data.added > 0) {
      showToast(`Added ${data.added} ingredients for tonight`)
      load()
    } else {
      showToast('Nothing to add — no dinner planned or already on list')
    }
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
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
    const start = format(weekStart, 'yyyy-MM-dd')
    const end = format(addDays(weekStart, 6), 'yyyy-MM-dd')
    const res = await fetch('/api/shopping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate', start, end }),
    })
    const data = await res.json()
    setGenerating(false)
    showToast(data.ok ? `Added ${data.added} ingredients from this week` : `Error: ${data.error}`)
    load()
  }

  const syncList = async (silent = false) => {
    setSyncing(true)
    try {
      const res = await fetch('/api/ha/sync', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setLastSync(data)
        const changed = (data.imported ?? data.added ?? 0) + (data.linked ?? 0) + (data.pushed ?? 0) + (data.checked ?? 0) + (data.sorted ?? 0)
        if (changed > 0) {
          await load()
          const parts = []
          if ((data.imported ?? data.added) > 0) parts.push(`${data.imported ?? data.added} imported`)
          if (data.pushed > 0) parts.push(`${data.pushed} sent to HA`)
          if (data.linked > 0) parts.push(`${data.linked} linked`)
          if (data.checked > 0) parts.push(`${data.checked} checked off`)
          if (data.sorted > 0) parts.push('sorted')
          if (data.needsCategory > 0) parts.push(`${data.needsCategory} need category`)
          if (!silent) showToast(`Synced: ${parts.join(', ')}`)
        } else if (!silent) showToast('Nothing new on your list')
      } else if (!silent) {
        setLastSync({ ok: false, error: data.error || 'Sync failed' })
        showToast(`Sync failed: ${data.error}`)
      }
    } catch {
      setLastSync({ ok: false, error: 'Sync failed — check Settings' })
      if (!silent) showToast('Sync failed — check Settings')
    }
    setSyncing(false)
  }

  const addItem = async () => {
    if (!newItem.trim()) return
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newItem.trim(), amount: newAmount.trim() }),
      })
      const item = await res.json()
      if (!res.ok) {
        showToast(item.error || 'Could not add item')
        return
      }
      setItems(prev => [...prev, item])
      setNewItem(''); setNewAmount(''); setShowAdd(false)
    } catch {
      showToast('Could not add item')
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

  const grouped = displayCategoryOrder.reduce<Record<string, ShoppingItem[]>>((acc, cat) => {
    const catItems = items.filter(i => i.category === cat)
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
            title="Generate from this week's plan"
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

      {/* Add item */}
      {showAdd && (
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4 space-y-3 animate-slide-up">
          <div className="flex gap-2">
            <input
              value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              placeholder="500g"
              className="w-20"
              onKeyDown={e => e.key === 'Enter' && addItem()}
            />
            <input
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              placeholder="Item name"
              className="flex-1"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && addItem()}
            />
          </div>
          <button
            onClick={addItem}
            className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all"
          >
            Add to list
          </button>
        </div>
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
              onKeyDown={e => e.key === 'Enter' && addStaple()}
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
                          className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                            item.checked
                              ? 'bg-primary border-primary'
                              : 'border-[#3a3a3a] hover:border-primary'
                          }`}
                        >
                          {item.checked && <Check size={10} className="text-white" strokeWidth={3} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm ${item.checked ? 'line-through text-[#555]' : 'text-white'}`}>
                            {item.name}
                          </span>
                          {(item.amount || item.unit) && (
                            <span className="text-xs text-primary ml-2">
                              {[item.amount, item.unit].filter(Boolean).join(' ')}
                            </span>
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
                          aria-label="Remove item"
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
      {toastMsg && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)] px-4 py-2.5 bg-[#1e1e1e] border border-[#333] rounded-lg text-sm text-white text-center shadow-xl animate-slide-up whitespace-normal">
          {toastMsg}
        </div>
      )}
    </div>
  )
}
