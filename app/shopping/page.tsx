'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Check, Plus, Copy, RefreshCw, ChevronDown, ChevronRight, X, Moon, Package, Tags, Search,
  MoreHorizontal, ListPlus, Send, CircleCheck,
} from 'lucide-react'
import { format, startOfWeek, addDays, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { track } from '@/lib/track'
import {
  type Selection, initialSelection, isSelected, toggleItem, setMealOn, setAllMealsOn,
  activeMealIds, isHidden, mealCounts, buildCommitLines,
} from '@/lib/shoppingSelection'

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
  meals: { meal_plan_id: string; date: string; recipe_name: string }[]
  status: 'new' | 'staple' | 'on_list'
  added?: boolean
}

/** A planned recipe meal in the review sheet. */
type ReviewMeal = {
  meal_plan_id: string
  date: string
  name: string
  recipe_id: string
  item_count: number
  /** Already shopped for — starts off and sits under „Schon eingekauft“. */
  added: boolean
  /** Hardly any ingredients in Mealie. */
  thin: boolean
}

type Review = {
  phase: 'loading' | 'select' | 'saving' | 'added' | 'sending' | 'sent'
  items: ReviewItem[]
  meals: ReviewMeal[]
  haConfigured: boolean
  end: string
  /** „Trotzdem anzeigen“ was tapped on the everything-bought screen. */
  showAll?: boolean
  /** Meals marked „schon eingekauft“ in this sheet. */
  markedBought: string[]
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

/** "Heute", "Morgen" or "Sa 3." for a meal row. */
function mealDayLabel(date: string): string {
  const d = parseISO(date)
  const today = new Date()
  if (format(d, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) return 'Heute'
  if (format(d, 'yyyy-MM-dd') === format(addDays(today, 1), 'yyyy-MM-dd')) return 'Morgen'
  return format(d, 'EEEEEE d.', { locale: de })
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
  const [sel, setSel] = useState<Selection>(() => initialSelection([]))
  const [stapleBusy, setStapleBusy] = useState<string | null>(null)
  const [markBusy, setMarkBusy] = useState<string | null>(null)

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
    setReview({ phase: 'loading', items: [], meals: [], haConfigured: false, end, markedBought: [] })
    setSel(initialSelection([]))
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', start: format(new Date(), 'yyyy-MM-dd'), end }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || 'preview failed')
      const reviewItems: ReviewItem[] = data.items ?? []
      const reviewMeals: ReviewMeal[] = Array.isArray(data.meals) ? data.meals : []
      setSel(initialSelection(reviewMeals))
      setReview({
        phase: 'select',
        items: reviewItems,
        meals: reviewMeals,
        haConfigured: !!data.ha_configured,
        end: data.end ?? end,
        markedBought: [],
      })
    } catch {
      setReview(r => r && { ...r, phase: 'select', error: 'Zutaten konnten nicht geladen werden. Bitte nochmal versuchen.' })
    }
  }

  const closeReview = () => {
    if (review && (review.phase === 'saving' || review.phase === 'sending')) return
    setReview(null)
  }

  const toggleReviewItem = (item: ReviewItem) => {
    setSel(prev => toggleItem(item, prev))
  }

  const toggleMeal = (meal: ReviewMeal) => {
    if (!review) return
    const on = !sel.on.has(meal.meal_plan_id)
    track('shopping_meal_toggle', { on })
    setSel(prev => setMealOn(meal.meal_plan_id, on, review.items, prev))
  }

  /** Record a meal as „schon eingekauft“ (bought = true) or open it again (bought = false). */
  const markMealBought = async (meal: ReviewMeal, bought: boolean) => {
    if (!review || markBusy) return
    const id = meal.meal_plan_id
    const before = { review, sel }
    if (bought) track('shopping_meal_mark_bought')
    setMarkBusy(id)
    setSel(prev => setMealOn(id, !bought, review.items, prev))
    setReview(r => r && {
      ...r,
      meals: r.meals.map(m => m.meal_plan_id === id ? { ...m, added: bought } : m),
      markedBought: bought ? [...r.markedBought.filter(x => x !== id), id] : r.markedBought.filter(x => x !== id),
    })
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_meals', meal_plan_ids: [id], added: bought }),
      })
      if (!res.ok) throw new Error('mark_meals failed')
    } catch {
      setSel(before.sel)
      setReview(r => r && { ...r, meals: before.review.meals, markedBought: before.review.markedBought })
      showToast('Konnte nicht gespeichert werden', { duration: ERROR_MS })
    } finally {
      setMarkBusy(null)
    }
  }

  const showAllMeals = () => {
    if (!review) return
    setSel(prev => setAllMealsOn(review.meals.map(m => m.meal_plan_id), prev))
    setReview(r => r && { ...r, showAll: true })
  }

  const markAlwaysThere = async (item: ReviewItem) => {
    setStapleBusy(item.key)
    const staple = await addStapleByName(item.name)
    setStapleBusy(null)
    if (!staple) return
    track('pantry_add', { from: 'review' })
    setSel(prev => {
      const overrides = new Map(prev.overrides)
      overrides.delete(item.key)
      return { on: prev.on, overrides }
    })
    setReview(r => r && { ...r, items: r.items.map(i => i.key === item.key ? { ...i, status: 'staple' } : i) })
    showToast(`„${item.name}“ ist jetzt im Vorrat`)
  }

  const commitReview = async () => {
    if (!review) return
    // Items already on the list are sent too (for meals that are on), so their row learns the
    // new meals. Each line only names the meals it is currently for.
    const mealNames = new Map(review.meals.map(m => [m.meal_plan_id, m.name]))
    const { chosen, lines: payload } = buildCommitLines(review.items, sel, mealNames)
    if (chosen.length === 0) {
      // Nothing to add, but meals were marked „schon eingekauft“ — that is already saved.
      if (review.markedBought.length > 0) setReview(null)
      return
    }
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
    const bought = new Set(review.meals.filter(m => m.added).map(m => m.meal_plan_id))
    const visible = review.items.filter(i => !isHidden(i, sel, bought))
    return displayCategoryOrder
      .map(cat => ({
        cat,
        items: visible
          .filter(i => (CATEGORIES.includes(i.category) ? i.category : 'other') === cat)
          .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name, 'de')),
      }))
      .filter(g => g.items.length > 0)
    // displayCategoryOrder is derived from categoryOrder + items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, sel, categoryOrder, items])

  const selectedCount = review ? review.items.filter(i => isSelected(i, sel)).length : 0
  const openMeals = review ? review.meals.filter(m => !m.added) : []
  const boughtMeals = review ? review.meals.filter(m => m.added) : []
  /** Every planned meal is already shopped for and none was switched back on. */
  const allBought = !!review && review.meals.length > 0 && openMeals.length === 0
    && !review.showAll && review.meals.every(m => !sel.on.has(m.meal_plan_id))
  const canFinish = !!review && selectedCount === 0 && review.markedBought.length > 0

  const iconBtn = 'w-10 h-10 flex items-center justify-center rounded-lg transition-colors'

  /** One row in the „Mahlzeiten“ block: switch + day/dish + „schon eingekauft“ action. */
  const renderMealRow = (meal: ReviewMeal) => {
    if (!review) return null
    const on = sel.on.has(meal.meal_plan_id)
    const { selected: nSel, total } = mealCounts(meal.meal_plan_id, review.items, sel)
    const busy = review.phase === 'saving' || markBusy === meal.meal_plan_id
    const detail = meal.added && !on
      ? 'Antippen, um nochmal einzukaufen'
      : total === 0 ? 'Keine Zutaten hinterlegt' : `${nSel} von ${total} Zutaten`
    return (
      <div key={meal.meal_plan_id} className="flex items-center gap-1 pr-1">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => toggleMeal(meal)}
          disabled={busy}
          className="flex-1 min-w-0 min-h-[56px] flex items-center gap-3 pl-3 pr-1 py-2 text-left rounded-xl hover:bg-[#1c1c1c] disabled:opacity-60"
        >
          <span className={`relative flex-shrink-0 inline-block h-6 w-10 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-[#3a3a3a]'}`}>
            <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
          </span>
          <span className="flex-1 min-w-0">
            <span className={`block text-[15px] leading-snug line-clamp-2 ${on ? 'text-white' : 'text-[#b5b5b5]'}`}>
              <span className={on ? 'text-[#d0d0d0]' : 'text-[#9a9a9a]'}>{mealDayLabel(meal.date)}</span>
              <span className="text-[#7a7a7a]"> · </span>
              {meal.name}
            </span>
            <span className="block text-[13px] leading-snug text-[#9a9a9a]">
              {detail}
              {meal.thin && total > 0 && <span className="text-amber-200/90"> · kaum Zutaten in Mealie</span>}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => markMealBought(meal, !meal.added)}
          disabled={busy}
          aria-label={meal.added ? `„${meal.name}“ doch nicht eingekauft` : `„${meal.name}“ als schon eingekauft markieren`}
          className="flex-shrink-0 min-h-[44px] max-w-[96px] px-2 rounded-lg text-xs leading-tight text-center text-[#a5a5a5] underline decoration-[#555] underline-offset-2 hover:text-white hover:bg-[#1c1c1c] disabled:opacity-50"
        >
          {meal.added ? 'Nicht gekauft' : 'Schon eingekauft'}
        </button>
      </div>
    )
  }

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
                  {review.phase === 'select' && review.items.length > 0 && !allBought && ' · Abwählen, was ihr habt'}
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
                review.meals.length === 0 ? (
                  <div className="text-center px-4 py-10">
                    <p className="text-[#d0d0d0]">Keine Rezepte mit Zutaten geplant.</p>
                    <p className="text-sm text-[#8a8a8a] mt-1">Reste, Auswärts essen und Bestellen brauchen keine Zutaten.</p>
                  </div>
                ) : allBought ? (
                  <div className="text-center px-4 py-10">
                    <CircleCheck size={36} className="mx-auto text-primary mb-3" />
                    <p className="text-[#e5e5e5]">Alles für die geplanten Mahlzeiten ist schon eingekauft</p>
                    <p className="text-sm text-[#9a9a9a] mt-1">Neu geplante Gerichte tauchen hier auf.</p>
                    <button
                      type="button"
                      onClick={showAllMeals}
                      className="mt-3 min-h-[44px] px-3 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary-hover"
                    >
                      Trotzdem anzeigen
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Meals: switch whole dishes on / off */}
                    <section aria-labelledby="review-meals" className="px-2 pt-1 pb-3">
                      <h3 id="review-meals" className="pb-1.5 text-sm font-semibold text-white">Mahlzeiten</h3>
                      {openMeals.length > 0 && (
                        <div className="rounded-xl border border-[#262626] bg-[#171717] divide-y divide-[#232323]">
                          {openMeals.map(meal => renderMealRow(meal))}
                        </div>
                      )}
                      {boughtMeals.length > 0 && (
                        <>
                          <p className="pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-[#9a9a9a]">Schon eingekauft</p>
                          <div className="rounded-xl border border-[#222] bg-[#141414] divide-y divide-[#202020]">
                            {boughtMeals.map(meal => renderMealRow(meal))}
                          </div>
                        </>
                      )}
                    </section>

                    <h3 className="px-2 pt-1 text-sm font-semibold text-white">Zutaten</h3>
                    {reviewGroups.length === 0 ? (
                      <p className="px-2 py-4 text-sm text-[#9a9a9a]">
                        {review.items.length === 0
                          ? 'In Mealie sind für diese Gerichte keine Zutaten hinterlegt.'
                          : sel.on.size > 0
                            ? 'Für die eingeschalteten Gerichte ist nichts mehr einzukaufen.'
                            : 'Keine Mahlzeit eingeschaltet – schalte oben ein Gericht ein.'}
                      </p>
                    ) : (
                      reviewGroups.map(group => (
                        <div key={group.cat} className="mb-2">
                          <p className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-[#8a8a8a]">
                            {CATEGORY_LABELS[group.cat] || group.cat}
                          </p>
                          {group.items.map(item => {
                            const isOnList = item.status === 'on_list'
                            const itemSelected = isSelected(item, sel)
                            const forMeals = activeMealIds(item, sel)
                            const mealsOff = !item.meal_plan_ids.some(id => sel.on.has(id))
                            const tag = isOnList ? 'schon drauf'
                              : itemSelected ? ''
                                : item.status === 'staple' ? 'Vorrat'
                                  : mealsOff && !sel.overrides.has(item.key) ? 'Gericht aus' : 'haben wir'
                            return (
                              <div key={item.key} className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => !isOnList && toggleReviewItem(item)}
                                  disabled={isOnList || review.phase === 'saving'}
                                  aria-pressed={isOnList ? undefined : itemSelected}
                                  className="flex-1 min-w-0 min-h-[52px] flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-[#1a1a1a] disabled:hover:bg-transparent"
                                >
                                  <span className={`w-[22px] h-[22px] flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${
                                    itemSelected ? 'bg-primary border-primary' : isOnList ? 'border-[#3a3a3a] bg-[#262626]' : 'border-[#555]'
                                  }`}>
                                    {itemSelected && <Check size={13} className="text-white" strokeWidth={3} />}
                                    {isOnList && <Check size={13} className="text-[#8a8a8a]" strokeWidth={3} />}
                                  </span>
                                  <span className="flex-1 min-w-0">
                                    <span className={`block text-[15px] leading-snug ${itemSelected ? 'text-white' : 'text-[#9a9a9a]'}`}>
                                      {item.name}
                                    </span>
                                    <span className="block text-[13px] leading-snug text-[#8a8a8a] line-clamp-2">
                                      {datedMealsLabel(item.meals.filter(m => forMeals.includes(m.meal_plan_id)))}
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
                )
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
                review.phase !== 'loading' && (review.meals.length === 0 || allBought || canFinish) ? (
                  <button
                    onClick={closeReview}
                    className={canFinish || (allBought && review.markedBought.length > 0)
                      ? 'w-full min-h-[48px] rounded-xl bg-primary hover:bg-primary-hover text-white text-base font-semibold transition-colors'
                      : 'w-full min-h-[48px] rounded-xl bg-[#1c1c1c] border border-[#2a2a2a] text-[#e5e5e5] text-base font-medium'}
                  >
                    {canFinish || (allBought && review.markedBought.length > 0) ? 'Fertig' : 'Schließen'}
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
