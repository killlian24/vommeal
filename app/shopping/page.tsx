'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Check, Plus, Copy, RefreshCw, ChevronDown, ChevronRight, X, Moon, Package, Tags, Search,
  MoreHorizontal, ListPlus, Send, CircleCheck, Info,
} from 'lucide-react'
import { format, startOfWeek, addDays, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { track } from '@/lib/track'

type ShoppingItem = {
  id: string; name: string; amount: string; unit: string
  category: string; checked: boolean; source: string
  meal_plan_id?: string | null; ha_uid?: string | null; sort_order?: number
  recipe_names?: string[]; meal_plan_ids?: string[]
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

type ReviewItem = {
  key: string
  name: string
  category: string
  recipe_names: string[]
  meal_plan_ids: string[]
  meals: { date: string; recipe_name: string }[]
  status: 'new' | 'staple' | 'on_list'
}

type Review = {
  phase: 'loading' | 'select' | 'saving' | 'added' | 'sending' | 'sent'
  items: ReviewItem[]
  hints: { recipe_name: string; count: number }[]
  meals: number
  skippedMeals: number
  haConfigured: boolean
  end: string
  added?: number
  merged?: number
  sendResult?: { ok: boolean; msg: string }
  error?: string
}

const CATEGORY_LABELS: Record<string, string> = {
  produce: '🥦 Obst & Gemüse',
  meat: '🥩 Fleisch & Fisch',
  dairy: '🧀 Milchprodukte & Eier',
  bakery: '🍞 Brot & Nudeln',
  pantry: '🫙 Trockenware & Konserven',
  frozen: '🧊 Tiefkühl',
  beverages: '🥤 Getränke',
  other: '📦 Sonstiges',
}

const DEFAULT_CATEGORY_ORDER = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other']
const CATEGORIES = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other']

const UNDO_MS = 6000
const ERROR_MS = 6000
const SEARCH_THRESHOLD = 8

const STATUS_ORDER: Record<ReviewItem['status'], number> = { new: 0, staple: 1, on_list: 2 }

/** "für Linsen, Tajine" — which meals a row is for. */
function mealsLabel(names: string[] | undefined): string {
  return names && names.length > 0 ? `für ${names.join(', ')}` : ''
}

/** "Mo 29. Linsen · Mi 1. Tajine" — meals with their day, for the review sheet. */
function datedMealsLabel(meals: ReviewItem['meals']): string {
  return [...meals]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(m => `${format(parseISO(m.date), 'EEEEEE d.', { locale: de })} ${m.recipe_name}`)
    .join(' · ')
}

function endOfNextWeek(): string {
  return format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 13), 'yyyy-MM-dd')
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Turn a sync result into a short German summary ("2 an Keep gesendet, 1 aus Keep übernommen"). */
function syncSummary(data: SyncResult & { added?: number }): string {
  const imported = data.imported ?? data.added ?? 0
  return [
    (data.pushed ?? 0) > 0 ? `${data.pushed} an Keep gesendet` : '',
    imported > 0 ? `${imported} aus Keep übernommen` : '',
    (data.linked ?? 0) > 0 ? `${data.linked} verknüpft` : '',
    (data.checked ?? 0) > 0 ? `${data.checked} abgehakt` : '',
    (data.sorted ?? 0) > 0 ? 'Keep sortiert' : '',
    (data.needsCategory ?? 0) > 0 ? `${data.needsCategory} ohne Kategorie` : '',
  ].filter(Boolean).join(', ')
}

export default function ShoppingPage() {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [categoryOrder, setCategoryOrder] = useState<string[]>(DEFAULT_CATEGORY_ORDER)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [addingTonight, setAddingTonight] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [newItem, setNewItem] = useState('')
  const [showPantry, setShowPantry] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [staples, setStaples] = useState<PantryStaple[]>([])
  const [newStaple, setNewStaple] = useState('')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<SyncResult | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [stapleBusy, setStapleBusy] = useState<string | null>(null)

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

  // Lock page scroll while the review sheet is open; Escape closes sheet / menu.
  useEffect(() => {
    if (!review) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [review])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setMenuOpen(false)
      setReview(r => (r && (r.phase === 'saving' || r.phase === 'sending') ? r : null))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const load = async (showSkeleton = true) => {
    if (showSkeleton) setLoading(true)
    try {
      const res = await fetch('/api/shopping')
      if (!res.ok) throw new Error('shopping load failed')
      setItems(await res.json())
    } catch {
      showToast('Einkaufsliste konnte nicht geladen werden', { duration: ERROR_MS })
    } finally {
      setLoading(false)
    }
  }

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
      showToast('Eintrag konnte nicht geändert werden', { duration: ERROR_MS })
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
      showToast('Kategorie konnte nicht geändert werden', { duration: ERROR_MS })
      setItems(previous)
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
      showToast(restored.length === 1 ? `„${restored[0].name}“ ist wieder da` : `${restored.length} Einträge sind wieder da`)
    } catch {
      showToast('Wiederherstellen hat nicht geklappt', { duration: ERROR_MS })
      load(false)
    }
  }

  const remove = async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return
    const previous = items
    setItems(prev => prev.filter(i => i.id !== id))
    const pending = fetch(`/api/shopping/${id}`, { method: 'DELETE' })
    showToast(`„${item.name}“ entfernt`, {
      duration: UNDO_MS,
      action: { label: 'Rückgängig', onClick: () => { hideToast(); restoreItems([item], pending) } },
    })
    try {
      const res = await pending
      if (!res.ok) throw new Error('delete failed')
    } catch {
      setItems(previous)
      showToast('Eintrag konnte nicht entfernt werden', { duration: ERROR_MS })
    }
  }

  const clearChecked = async () => {
    const removed = items.filter(i => i.checked)
    if (removed.length === 0) return
    const previous = items
    setItems(prev => prev.filter(i => !i.checked))
    const pending = fetch('/api/shopping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_checked' }) })
    showToast(`${plural(removed.length, 'erledigter Eintrag', 'erledigte Einträge')} entfernt`, {
      duration: UNDO_MS,
      action: { label: 'Rückgängig', onClick: () => { hideToast(); restoreItems(removed, pending) } },
    })
    try {
      const res = await pending
      if (!res.ok) throw new Error('clear checked failed')
    } catch {
      setItems(previous)
      showToast('Erledigte konnten nicht entfernt werden', { duration: ERROR_MS })
    }
  }

  const clearAll = async () => {
    if (!confirm('Wirklich die ganze Liste löschen? Das lässt sich nicht rückgängig machen.')) return
    const previous = items
    setItems([])
    try {
      const res = await fetch('/api/shopping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_all' }) })
      if (!res.ok) throw new Error('clear all failed')
      showToast('Liste gelöscht')
    } catch {
      setItems(previous)
      showToast('Liste konnte nicht gelöscht werden', { duration: ERROR_MS })
    }
  }

  const addTonight = async () => {
    setMenuOpen(false)
    setAddingTonight(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_date', date: today }),
      })
      if (!res.ok) throw new Error('add_date failed')
      const data = await res.json()
      if (data.added > 0 || data.merged > 0) {
        showToast(`${plural(data.added + (data.merged ?? 0), 'Zutat', 'Zutaten')} für heute auf der Liste`)
        load(false)
      } else {
        showToast('Nichts hinzuzufügen – kein Rezept für heute geplant oder schon auf der Liste', { duration: 4000 })
      }
    } catch {
      showToast('Heute-Zutaten konnten nicht hinzugefügt werden', { duration: ERROR_MS })
    }
    setAddingTonight(false)
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
      showToast('Konnte nicht zum Vorrat hinzugefügt werden', { duration: ERROR_MS })
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
      showToast('Konnte nicht aus dem Vorrat entfernt werden', { duration: ERROR_MS })
    }
  }

  /** POST /api/ha/sync and describe the outcome in German. */
  const runSync = async (): Promise<{ ok: boolean; msg: string; data?: SyncResult }> => {
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
        return { ok: true, msg: syncSummary(data), data }
      }
      const rawReason = data.error
        ? String(data.error)
        : bodyText.trim() && !/^\s*</.test(bodyText) ? bodyText.trim().slice(0, 160) : `HTTP ${res.status}`
      const reason = rawReason
        .replace(/^Cannot reach Home Assistant:\s*/i, '')
        .replace(/^TypeError:\s*/i, '')
      let msg: string
      if (/not configured/i.test(reason)) msg = 'Home Assistant ist nicht eingerichtet – bitte in den Einstellungen eintragen.'
      else if (res.status === 409 || /already running/i.test(reason)) msg = 'Abgleich läuft gerade schon – gleich nochmal versuchen.'
      else if (res.status === 503 || /fetch failed|ECONN|ENOTFOUND|timeout|unreachable/i.test(reason)) msg = `Home Assistant nicht erreichbar (${reason})`
      else msg = `Abgleich fehlgeschlagen (${reason})`
      setLastSync({ ok: false, error: msg })
      return { ok: false, msg }
    } catch {
      const msg = 'Abgleich fehlgeschlagen – bitte Einstellungen prüfen.'
      setLastSync({ ok: false, error: msg })
      return { ok: false, msg }
    }
  }

  const syncList = async () => {
    setSyncing(true)
    const result = await runSync()
    if (result.ok) {
      await load(false)
      showToast(result.msg ? `Abgeglichen: ${result.msg}` : 'Keep ist schon aktuell')
    } else {
      showToast(result.msg, { duration: ERROR_MS })
    }
    setSyncing(false)
  }

  // --- Zutaten der Woche ---------------------------------------------------

  const openReview = async () => {
    setMenuOpen(false)
    setShowPantry(false)
    track('shopping_review_open')
    const end = endOfNextWeek()
    setReview({ phase: 'loading', items: [], hints: [], meals: 0, skippedMeals: 0, haConfigured: false, end })
    setSelected(new Set())
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', start: format(new Date(), 'yyyy-MM-dd'), end }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || 'preview failed')
      const reviewItems: ReviewItem[] = data.items ?? []
      setSelected(new Set(reviewItems.filter(i => i.status === 'new').map(i => i.key)))
      setReview({
        phase: 'select',
        items: reviewItems,
        hints: data.hints ?? [],
        meals: data.meals ?? 0,
        skippedMeals: data.skipped_meals ?? 0,
        haConfigured: !!data.ha_configured,
        end: data.end ?? end,
      })
    } catch {
      setReview(r => r && { ...r, phase: 'select', error: 'Zutaten konnten nicht geladen werden. Bitte nochmal versuchen.' })
    }
  }

  const closeReview = () => {
    if (review && (review.phase === 'saving' || review.phase === 'sending')) return
    setReview(null)
  }

  const toggleReviewItem = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const markAlwaysThere = async (item: ReviewItem) => {
    setStapleBusy(item.key)
    const staple = await addStapleByName(item.name)
    setStapleBusy(null)
    if (!staple) return
    track('pantry_add', { from: 'review' })
    setSelected(prev => { const next = new Set(prev); next.delete(item.key); return next })
    setReview(r => r && { ...r, items: r.items.map(i => i.key === item.key ? { ...i, status: 'staple' } : i) })
    showToast(`„${item.name}“ ist jetzt im Vorrat`)
  }

  const commitReview = async () => {
    if (!review) return
    const chosen = review.items.filter(i => i.status !== 'on_list' && selected.has(i.key))
    // Items already on the list are sent too, so their row learns the new meals.
    const alreadyOnList = review.items.filter(i => i.status === 'on_list')
    const payload = [...chosen, ...alreadyOnList].map(({ name, category, recipe_names, meal_plan_ids }) => ({
      name, category, recipe_names, meal_plan_ids,
    }))
    if (chosen.length === 0) return
    setReview(r => r && { ...r, phase: 'saving', error: undefined })
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_selected', items: payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || 'add_selected failed')
      track('shopping_add', { count: chosen.length })
      await load(false)
      const haConfigured = data.ha_configured ?? review.haConfigured
      if (haConfigured) {
        setReview(r => r && { ...r, phase: 'added', added: chosen.length, merged: data.merged ?? 0, haConfigured })
      } else {
        setReview(null)
        showToast(`${plural(chosen.length, 'Zutat', 'Zutaten')} auf der Liste`)
      }
    } catch {
      setReview(r => r && { ...r, phase: 'select', error: 'Hinzufügen hat nicht geklappt. Bitte nochmal versuchen.' })
    }
  }

  const sendToKeep = async () => {
    track('shopping_send_keep')
    setReview(r => r && { ...r, phase: 'sending' })
    const result = await runSync()
    if (result.ok) await load(false)
    setReview(r => r && {
      ...r,
      phase: 'sent',
      sendResult: result.ok
        ? { ok: true, msg: (result.data?.pushed ?? 0) > 0 ? `${plural(result.data?.pushed ?? 0, 'Eintrag', 'Einträge')} an Keep gesendet.` : 'Keep war schon aktuell.' }
        : { ok: false, msg: result.msg },
    })
  }

  // --- Manual add / copy ------------------------------------------------------

  const addInputRef = useRef<HTMLInputElement | null>(null)

  // Adds one or more items ("Banane, Milch, Brot"). The field stays open and
  // focused so several things can be typed in a row without tapping "+" again.
  const addItem = async () => {
    const names = newItem.split(/[,;\n]+/).map(n => n.trim()).filter(Boolean)
    if (names.length === 0) return
    setNewItem('')
    addInputRef.current?.focus()
    const added: ShoppingItem[] = []
    const failed: string[] = []
    for (const name of names) {
      try {
        const res = await fetch('/api/shopping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
        const item = await res.json().catch(() => ({}))
        if (res.ok) added.push(item as ShoppingItem)
        else failed.push(name)
      } catch {
        failed.push(name)
      }
    }
    if (added.length > 0) {
      setItems(prev => [...prev, ...added])
      track('shopping_manual_add', { count: added.length })
    }
    if (failed.length > 0) {
      setNewItem(failed.join(', '))
      showToast(`Nicht hinzugefügt: ${failed.join(', ')}`, { duration: ERROR_MS })
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
      showToast('Kopieren hat nicht geklappt', { duration: ERROR_MS })
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

  const reviewGroups = useMemo(() => {
    if (!review) return []
    return displayCategoryOrder
      .map(cat => ({
        cat,
        items: review.items
          .filter(i => (CATEGORIES.includes(i.category) ? i.category : 'other') === cat)
          .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name, 'de')),
      }))
      .filter(g => g.items.length > 0)
    // displayCategoryOrder is derived from categoryOrder + items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, categoryOrder, items])

  const selectedCount = review ? review.items.filter(i => i.status !== 'on_list' && selected.has(i.key)).length : 0

  const iconBtn = 'w-10 h-10 flex items-center justify-center rounded-lg transition-colors'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white">Einkauf</h1>
            <p className="text-sm text-[#9a9a9a] mt-0.5">
              {totalCount === 0 ? 'Liste ist leer' : `${openCount} offen${checkedCount > 0 ? ` · ${checkedCount} erledigt` : ''}`}
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
                      onClick={addTonight}
                      disabled={addingTonight}
                      className="w-full min-h-[44px] flex items-center gap-3 px-4 text-sm text-[#e5e5e5] hover:bg-[#252525] disabled:opacity-60"
                    >
                      <Moon size={16} className={`text-[#9a9a9a] ${addingTonight ? 'animate-pulse' : ''}`} />
                      Heute-Zutaten
                    </button>
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
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-stretch gap-2">
          <button
            onClick={openReview}
            className="flex-1 min-h-[48px] flex items-center justify-center gap-2 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-base font-semibold transition-colors"
          >
            <ListPlus size={19} />
            Zutaten der Woche
          </button>
          <button
            onClick={syncList}
            disabled={syncing}
            aria-label="Mit Keep abgleichen"
            title="Mit Keep abgleichen"
            className="min-h-[48px] flex items-center gap-2 px-3.5 rounded-xl bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-sm text-[#d0d0d0] hover:text-white transition-colors disabled:opacity-70"
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            <span>Keep</span>
          </button>
        </div>

        {lastSync && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${
            lastSync.ok ? 'border-[#243525] bg-[#101810] text-[#9fb8a1]' : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}>
            {lastSync.ok
              ? <p>Zuletzt abgeglichen: {syncSummary(lastSync) || 'nichts Neues'}</p>
              : <p>{lastSync.error}</p>}
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
          className="flex-1 min-h-[48px] placeholder:text-[#7a7a7a]"
          enterKeyHint="enter"
          autoComplete="off"
          aria-label="Eintrag hinzufügen"
        />
        <button
          type="submit"
          disabled={!newItem.trim()}
          aria-label="Auf die Liste"
          className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded-lg bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-40"
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
              <p className="text-xs text-[#9a9a9a] mt-0.5">Immer im Haus – wird bei „Zutaten der Woche“ nicht vorausgewählt.</p>
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
              className="flex-1 text-sm min-h-[44px] placeholder:text-[#7a7a7a]"
              aria-label="Neuer Vorrat"
              enterKeyHint="done"
            />
            <button
              type="submit"
              className="px-4 min-h-[44px] rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
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
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8a8a] pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Nach Zutat oder Gericht filtern …"
            aria-label="Einkaufsliste filtern"
            className="w-full pl-9 pr-11 min-h-[44px] placeholder:text-[#7a7a7a]"
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
                            aria-label={item.checked ? `„${item.name}“ wieder offen` : `„${item.name}“ abhaken`}
                            className="w-10 h-10 flex-shrink-0 flex items-center justify-center"
                          >
                            <span className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-all ${
                              item.checked ? 'bg-primary border-primary' : 'border-[#555] hover:border-primary'
                            }`}>
                              {item.checked && <Check size={12} className="text-white" strokeWidth={3} />}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggle(item.id)}
                            tabIndex={-1}
                            className="flex-1 min-w-0 min-h-[40px] flex flex-col justify-center text-left py-1.5"
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
                            onClick={() => setEditingCategoryId(editingCategoryId === item.id ? null : item.id)}
                            disabled={item.checked}
                            title="Kategorie ändern"
                            aria-label={`Kategorie von „${item.name}“ ändern`}
                            aria-expanded={editingCategoryId === item.id}
                            className={`${iconBtn} text-[#8a8a8a] hover:text-primary hover:bg-[#1c1c1c] disabled:opacity-30`}
                          >
                            <Tags size={15} />
                          </button>
                          <button
                            onClick={() => remove(item.id)}
                            aria-label={`„${item.name}“ entfernen`}
                            className={`${iconBtn} text-[#8a8a8a] hover:text-red-400 hover:bg-[#1c1c1c]`}
                          >
                            <X size={16} />
                          </button>
                          {editingCategoryId === item.id && (
                            <div className="basis-full pl-11 pr-2 pb-2">
                              <select
                                value={item.category}
                                onChange={e => changeCategory(item.id, e.target.value)}
                                aria-label="Kategorie"
                                className="w-full text-sm min-h-[44px] bg-[#101010] border-[#2a2a2a] text-[#d0d0d0]"
                              >
                                {CATEGORIES.map(c => (
                                  <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
                                ))}
                              </select>
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
          {checkedCount > 0 && (
            <div className="flex gap-2">
              <button
                onClick={clearChecked}
                className="flex-1 min-h-[44px] rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-sm text-[#b5b5b5] hover:text-white transition-colors"
              >
                {plural(checkedCount, 'Erledigten', 'Erledigte')} entfernen
              </button>
              <button
                onClick={clearAll}
                className="px-4 min-h-[44px] rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-sm text-red-300 transition-colors"
              >
                Alles löschen
              </button>
            </div>
          )}
        </div>
      )}

      {/* Review sheet: Zutaten der Woche */}
      {review && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={closeReview} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
            className="relative w-full md:max-w-lg max-h-[88dvh] flex flex-col bg-[#121212] border-t md:border border-[#2a2a2a] rounded-t-2xl md:rounded-2xl shadow-2xl animate-slide-up"
          >
            {/* Sheet header */}
            <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 border-b border-[#222]">
              <div className="min-w-0">
                <h2 id="review-title" className="text-lg font-bold text-white">Zutaten der Woche</h2>
                <p className="text-sm text-[#9a9a9a]">
                  Heute bis {format(parseISO(review.end), 'EEEEEE d. MMM', { locale: de })}
                  {review.phase === 'select' && review.items.length > 0 && ' · Abwählen, was ihr habt'}
                </p>
              </div>
              <button
                onClick={closeReview}
                aria-label="Schließen"
                disabled={review.phase === 'saving' || review.phase === 'sending'}
                className={`${iconBtn} -mr-2 -mt-1 text-[#9a9a9a] hover:text-white disabled:opacity-40`}
              >
                <X size={20} />
              </button>
            </div>

            {/* Sheet body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2">
              {review.phase === 'loading' && (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
                </div>
              )}

              {review.error && (
                <p className="m-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{review.error}</p>
              )}

              {(review.phase === 'select' || review.phase === 'saving') && !review.error && (
                <>
                  {review.hints.length > 0 && (
                    <div className="mx-2 mb-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 space-y-0.5">
                      {review.hints.map(h => (
                        <p key={h.recipe_name} className="flex items-start gap-2 text-[13px] text-amber-200/90">
                          <Info size={14} className="mt-0.5 flex-shrink-0" />
                          <span>{h.recipe_name}: kaum Zutaten in Mealie hinterlegt</span>
                        </p>
                      ))}
                    </div>
                  )}

                  {review.items.length === 0 ? (
                    <div className="text-center px-4 py-10">
                      <p className="text-[#d0d0d0]">
                        {review.skippedMeals > 0 && review.meals === 0
                          ? 'Alle geplanten Gerichte stehen schon auf der Liste.'
                          : 'Keine Rezepte mit Zutaten geplant.'}
                      </p>
                      <p className="text-sm text-[#8a8a8a] mt-1">
                        {review.skippedMeals > 0 && review.meals === 0
                          ? 'Neu geplante Gerichte tauchen hier auf.'
                          : 'Reste, Auswärts essen und Bestellen brauchen keine Zutaten.'}
                      </p>
                    </div>
                  ) : (
                    reviewGroups.map(group => (
                      <div key={group.cat} className="mb-2">
                        <p className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-[#8a8a8a]">
                          {CATEGORY_LABELS[group.cat] || group.cat}
                        </p>
                        {group.items.map(item => {
                          const isOnList = item.status === 'on_list'
                          const isSelected = !isOnList && selected.has(item.key)
                          const tag = isOnList ? 'schon drauf' : isSelected ? '' : item.status === 'staple' ? 'Vorrat' : 'haben wir'
                          return (
                            <div key={item.key} className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => !isOnList && toggleReviewItem(item.key)}
                                disabled={isOnList || review.phase === 'saving'}
                                aria-pressed={isOnList ? undefined : isSelected}
                                className="flex-1 min-w-0 min-h-[52px] flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-[#1a1a1a] disabled:hover:bg-transparent"
                              >
                                <span className={`w-[22px] h-[22px] flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${
                                  isSelected ? 'bg-primary border-primary' : isOnList ? 'border-[#3a3a3a] bg-[#262626]' : 'border-[#555]'
                                }`}>
                                  {isSelected && <Check size={13} className="text-white" strokeWidth={3} />}
                                  {isOnList && <Check size={13} className="text-[#8a8a8a]" strokeWidth={3} />}
                                </span>
                                <span className="flex-1 min-w-0">
                                  <span className={`block text-[15px] leading-snug ${isSelected ? 'text-white' : 'text-[#9a9a9a]'}`}>
                                    {item.name}
                                  </span>
                                  <span className="block text-[13px] leading-snug text-[#8a8a8a] line-clamp-2">
                                    {datedMealsLabel(item.meals)}
                                  </span>
                                </span>
                                {tag && (
                                  <span className="flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-[#222] border border-[#333] text-[#a5a5a5]">
                                    {tag}
                                  </span>
                                )}
                              </button>
                              {item.status === 'new' && (
                                <button
                                  type="button"
                                  onClick={() => markAlwaysThere(item)}
                                  disabled={stapleBusy === item.key || review.phase === 'saving'}
                                  title="Zum Vorrat hinzufügen – wird künftig nicht mehr vorausgewählt"
                                  className="flex-shrink-0 min-h-[40px] px-2 rounded-lg text-xs text-[#9a9a9a] underline decoration-[#444] underline-offset-2 hover:text-white hover:bg-[#1a1a1a] disabled:opacity-50"
                                >
                                  Immer da
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))
                  )}
                </>
              )}

              {(review.phase === 'added' || review.phase === 'sending' || review.phase === 'sent') && (
                <div className="px-4 py-8 text-center space-y-2">
                  <CircleCheck size={40} className="mx-auto text-primary" />
                  <p className="text-lg font-semibold text-white">
                    {plural(review.added ?? selectedCount, 'Zutat', 'Zutaten')} auf der Liste
                  </p>
                  {review.phase !== 'sent' && (
                    <p className="text-sm text-[#9a9a9a]">Jetzt an Keep senden, damit ihr sie beim Einkaufen habt.</p>
                  )}
                  {review.sendResult && (
                    <p className={`text-sm ${review.sendResult.ok ? 'text-[#9fb8a1]' : 'text-red-300'}`}>
                      {review.sendResult.msg}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Sheet footer */}
            <div className="px-4 pt-3 border-t border-[#222] pb-[max(1rem,env(safe-area-inset-bottom))]">
              {(review.phase === 'select' || review.phase === 'saving' || review.phase === 'loading') && (
                review.items.length === 0 && review.phase !== 'loading' ? (
                  <button
                    onClick={closeReview}
                    className="w-full min-h-[48px] rounded-xl bg-[#1c1c1c] border border-[#2a2a2a] text-[#e5e5e5] text-base font-medium"
                  >
                    Schließen
                  </button>
                ) : (
                  <button
                    onClick={commitReview}
                    disabled={selectedCount === 0 || review.phase !== 'select'}
                    className="w-full min-h-[48px] rounded-xl bg-primary hover:bg-primary-hover disabled:bg-[#2a2a2a] disabled:text-[#9a9a9a] text-white text-base font-semibold transition-colors"
                  >
                    {review.phase === 'saving'
                      ? 'Wird hinzugefügt …'
                      : review.phase === 'loading'
                        ? 'Lädt …'
                        : selectedCount === 0 ? 'Nichts ausgewählt' : `${selectedCount} auf die Liste`}
                  </button>
                )
              )}
              {(review.phase === 'added' || review.phase === 'sending') && (
                <div className="flex gap-2">
                  <button
                    onClick={closeReview}
                    disabled={review.phase === 'sending'}
                    className="min-h-[48px] px-4 rounded-xl bg-[#1c1c1c] border border-[#2a2a2a] text-[#e5e5e5] text-base disabled:opacity-60"
                  >
                    Später
                  </button>
                  <button
                    onClick={sendToKeep}
                    disabled={review.phase === 'sending'}
                    className="flex-1 min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-80 text-white text-base font-semibold transition-colors"
                  >
                    {review.phase === 'sending'
                      ? <><RefreshCw size={17} className="animate-spin" /> Wird gesendet …</>
                      : <><Send size={17} /> An Keep senden</>}
                  </button>
                </div>
              )}
              {review.phase === 'sent' && (
                <div className="flex gap-2">
                  {!review.sendResult?.ok && (
                    <button
                      onClick={sendToKeep}
                      className="flex-1 min-h-[48px] rounded-xl bg-[#1c1c1c] border border-[#2a2a2a] text-[#e5e5e5] text-base"
                    >
                      Nochmal senden
                    </button>
                  )}
                  <button
                    onClick={closeReview}
                    className="flex-1 min-h-[48px] rounded-xl bg-primary hover:bg-primary-hover text-white text-base font-semibold"
                  >
                    Fertig
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 w-max max-w-[calc(100vw-2rem)] px-4 py-2.5 bg-[#1e1e1e] border border-[#333] rounded-lg text-sm text-white shadow-xl animate-slide-up whitespace-normal"
        >
          <span className="min-w-0 break-words">{toast.msg}</span>
          {toast.action && (
            <button
              type="button"
              onClick={toast.action.onClick}
              className="flex-shrink-0 min-h-[40px] px-1 text-primary font-semibold hover:underline"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
