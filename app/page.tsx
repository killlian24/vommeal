'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { format, startOfWeek, addDays, isToday, parseISO, getDay } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, X, Search, ShoppingCart,
  Zap, Dices, Heart, XCircle, ArrowLeftRight, ArrowRight, CalendarClock,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { StarRating } from '@/components/StarRating'
import { Avatar } from '@/components/Avatar'
import { useCurrentUser } from '@/components/UserProvider'
import { track } from '@/lib/track'
import { QUICK_MEALS, EATING_OUT, quickMealEmoji } from '@/lib/quickMeals'
import { planMove, applyMoves, type PlanMove } from '@/lib/planMoves'
import { shiftPlan, movePlanEntry, undoPlanChange } from '@/lib/planApi'
import { apiCall, NETWORK_ERROR } from '@/lib/apiCall'
import { useLongPressDrag, type DragDrop } from '@/lib/useLongPressDrag'
import { useRefreshOnResume } from '@/lib/useRefreshOnResume'
import {
  partnerChanges, partnerHint, responseTime, addMarks, dropMarks, loadMarks, saveMarks,
  loadLastSeen, saveLastSeen, type Marks,
} from '@/lib/partnerChanges'
import { MoveSheet } from '@/components/MoveSheet'

type Recipe = {
  id: string; name: string; image_url: string; prep_time: number; cook_time: number
  source: string; rating: number | null; effort?: 'quick' | 'involved' | null
}
type Nomination = { id: string; date: string; recipe_id: string; user_name: string; recipe?: Recipe }
type MealEntry = {
  id: string; date: string; meal_type: 'dinner'
  recipe_id: string | null; custom_meal_name: string | null
  servings: number; notes: string
  status: 'suggested' | 'approved'; suggested_by: string
  created_at?: string
  updated_at?: string
  updated_by?: string
  recipe?: Recipe
}
type Toast = { msg: string; action?: { label: string; onClick: () => void } }
type Picker = { date: string; replaceId?: string }

const SERVINGS = 2
const CARDS_PER_DAY = 3
const LEFTOVERS = 'Reste'
// Replacing today's dinner with one of these keeps the old dish by default
// (it moves to tomorrow, the rest of the week slides along).
const KEEP_OLD_BY_DEFAULT: string[] = [EATING_OUT, 'Bestellen']

const ds = (d: Date) => format(d, 'yyyy-MM-dd')
const fmt = (d: Date, pattern: string) => format(d, pattern, { locale: de })
const mondayOf = (d: Date) => startOfWeek(d, { weekStartsOn: 1 })

// Friday to Sunday the plan opens on next week: the current week is mostly
// decided by then and the next one is what needs planning.
function defaultWeekStart(now = new Date()): Date {
  const dow = getDay(now) // 0 = Sunday
  const monday = mondayOf(now)
  return dow === 5 || dow === 6 || dow === 0 ? addDays(monday, 7) : monday
}

// "22.–28. Sep." or "29. Sep. – 5. Okt."
function rangeLabel(start: Date, end: Date): string {
  return start.getMonth() === end.getMonth()
    ? `${fmt(start, 'd.')}–${fmt(end, 'd. MMM')}`
    : `${fmt(start, 'd. MMM')} – ${fmt(end, 'd. MMM')}`
}

const mealName = (e: MealEntry) => e.recipe?.name || e.custom_meal_name || 'Essen'
// Compare dish names loosely: case, surrounding and double spaces do not matter
const normName = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de')
const abende = (n: number) => `${n} ${n === 1 ? 'Abend' : 'Abende'}`
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

// Deterministic shuffle seeded by a string — both partners get the same cards per day
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const copy = [...arr]
  let h = 0
  for (let i = 0; i < seed.length; i++) { h = Math.imul(31, h) + seed.charCodeAt(i) | 0 }
  for (let i = copy.length - 1; i > 0; i--) {
    h = Math.imul(1664525, h) + 1013904223 | 0
    const j = Math.abs(h) % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

async function fetchRangeAt(start: string, end: string): Promise<{ data: MealEntry[]; at: number }> {
  const res = await fetch(`/api/meal-plan?start=${start}&end=${end}`)
  if (!res.ok) throw new Error('meal plan load failed')
  return { data: await res.json(), at: responseTime(res) }
}

async function fetchRange(start: string, end: string): Promise<MealEntry[]> {
  return (await fetchRangeAt(start, end)).data
}

// Recipe image, quick-meal emoji or a plate as fallback
function MealThumb({ entry, recipe, size }: { entry?: MealEntry; recipe?: Recipe; size: string }) {
  const [broken, setBroken] = useState(false)
  const r = recipe || entry?.recipe
  if (r?.image_url && !broken) {
    return (
      <div className={`${size} relative rounded-lg overflow-hidden flex-shrink-0 bg-[#1e1e1e]`}>
        <Image src={r.image_url} alt="" fill className="object-cover" unoptimized draggable={false} onError={() => setBroken(true)} />
      </div>
    )
  }
  const emoji = quickMealEmoji(entry?.custom_meal_name) || '🍽️'
  return (
    <div className={`${size} rounded-lg bg-[#1e1e1e] flex items-center justify-center text-xl flex-shrink-0`}>{emoji}</div>
  )
}

const iconBtn = 'w-10 h-10 flex items-center justify-center rounded-lg transition-all'
// Highlight for the day row under a dragged card
const dropBadge = 'absolute top-1.5 right-1.5 z-10 px-2 py-0.5 rounded-full bg-primary text-white text-xs font-semibold pointer-events-none'
const secondaryBtn = 'min-h-[40px] flex items-center justify-center gap-1.5 px-3 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-ink-soft hover:text-white text-sm font-medium transition-all disabled:opacity-50'

export default function PlanPage() {
  const [weekStart, setWeekStart] = useState(() => defaultWeekStart())
  const [entries, setEntries] = useState<MealEntry[]>([])
  const [todayEntry, setTodayEntry] = useState<MealEntry | null>(null)
  const [nextWeekPlanned, setNextWeekPlanned] = useState<number | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [picker, setPicker] = useState<Picker | null>(null)
  const [search, setSearch] = useState('')
  const [customName, setCustomName] = useState('')
  const [creatingRecipe, setCreatingRecipe] = useState(false)
  const [nextDayFree, setNextDayFree] = useState(false)
  const [addLeftovers, setAddLeftovers] = useState(false)
  // Replace mode: keep the old dish by shifting it one day later (null = default)
  const [keepOld, setKeepOld] = useState<boolean | null>(null)
  const [moveFor, setMoveFor] = useState<MealEntry | null>(null)
  const [moving, setMoving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [earlierOpen, setEarlierOpen] = useState(false)
  const [autofilling, setAutofilling] = useState(false)
  const { user: currentUser, users, partner, askUser } = useCurrentUser()
  // Evenings the partner planned or changed since this phone last looked ("neu")
  const [marks, setMarks] = useState<Marks>({})
  // Fun mode ("Swipen")
  const [funMode, setFunMode] = useState(false)
  const [funDayPicker, setFunDayPicker] = useState(false)
  const [funSelectedDates, setFunSelectedDates] = useState<Set<string>>(new Set())
  const [nominations, setNominations] = useState<Nomination[]>([])
  const [funDayIndex, setFunDayIndex] = useState(0)
  const [funCardIndex, setFunCardIndex] = useState(0)
  const [funDone, setFunDone] = useState(false)
  const pendingVotes = useRef<Promise<unknown>[]>([])
  const [settleDate, setSettleDate] = useState<string | null>(null)
  const [addingToList, setAddingToList] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  // How next week was opened on load; tracked once the profile is known
  const pendingOpenSource = useRef<string | null>(null)
  // Week whose cards are on screen: skeletons only when another week loads
  const shownWeek = useRef<string | null>(null)
  // Optimistic card changes still on their way: background refreshes must
  // not paint the older server state over them.
  const optimistic = useRef({ pending: 0, gen: 0 })

  const now = new Date()
  const todayStr = ds(now)
  const currentMonday = mondayOf(now)
  const currentWeekStr = ds(currentMonday)
  const nextWeekStr = ds(addDays(currentMonday, 7))
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const startStr = ds(weekStart)
  const endStr = ds(addDays(weekStart, 6))
  const isCurrentWeek = startStr === currentWeekStr
  const isNextWeek = startStr === nextWeekStr
  // Actions like "Zutaten" and "Füllen" never touch days that are already over
  const upcomingStartStr = startStr < todayStr ? todayStr : startStr
  const dow = getDay(now)
  const showPlanNextWeekCard = isCurrentWeek && (dow === 4 || dow === 5 || dow === 6 || dow === 0)

  const showToast = (msg: string, opts?: { action?: Toast['action']; duration?: number }) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, action: opts?.action })
    toastTimer.current = setTimeout(() => setToast(null), opts?.duration ?? 2500)
  }
  const hideToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(null)
  }

  const goToWeek = (monday: Date, source?: string) => {
    setWeekStart(monday)
    setEarlierOpen(false)
    if (source && ds(monday) === nextWeekStr) track('week_next_open', { source })
  }

  // Load recipes; honour ?week=next (who is using the phone: UserProvider)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('week') === 'next') {
      setWeekStart(addDays(mondayOf(new Date()), 7))
      pendingOpenSource.current = 'link'
      // Drop the query so a reload later in the week does not stick to "next"
      window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    } else if (ds(defaultWeekStart()) !== ds(mondayOf(new Date()))) {
      pendingOpenSource.current = 'weekend'
    }

    const loadInitial = async () => {
      try {
        const recipesRes = await fetch('/api/recipes')
        if (!recipesRes.ok) throw new Error('initial load failed')
        setRecipes(await recipesRes.json())
      } catch {
        setLoadError('Vommeal konnte nicht geladen werden. Bitte Verbindung prüfen und neu laden.')
      }
    }

    loadInitial()
  }, [])

  // Nothing is written without knowing who plans (asks "Wer bist du?" first).
  const ensureUser = () => {
    if (currentUser || users.length === 0) return true
    askUser()
    return false
  }

  // Skeletons only for the first load of a week; afterwards (after an action
  // or when coming back to the app) the cards update in place.
  // `background`: a refresh nobody asked for; it never shows errors and
  // drops its result when an optimistic change happened meanwhile.
  const loadEntries = useCallback(async (opts: { background?: boolean } = {}): Promise<MealEntry[] | null> => {
    const firstLoad = shownWeek.current !== startStr
    if (firstLoad) { setLoading(true); setLoadError('') }
    const gen = optimistic.current.gen
    try {
      const data = await fetchRange(startStr, endStr)
      if (opts.background && (optimistic.current.pending > 0 || optimistic.current.gen !== gen)) return null
      setEntries(data)
      shownWeek.current = startStr
      setLoadError('')
      return data
    } catch {
      if (firstLoad) setLoadError('Diese Woche konnte nicht geladen werden.')
      return null
    } finally {
      if (firstLoad) setLoading(false)
    }
  }, [startStr, endStr])

  const loadNominations = useCallback(async (opts: { background?: boolean } = {}) => {
    try {
      const res = await fetch(`/api/nominations?start=${startStr}&end=${endStr}`)
      if (res.ok) setNominations(await res.json())
    } catch {
      if (!opts.background) setLoadError('Stimmen konnten nicht geladen werden.')
    }
  }, [startStr, endStr])

  // Today's dinner, needed for the "Heute" row when another week is shown
  const loadToday = useCallback(async () => {
    try {
      const t = ds(new Date())
      const data = await fetchRange(t, t)
      setTodayEntry(data[0] ?? null)
    } catch { /* the row just shows "noch nichts geplant" */ }
  }, [])

  const refresh = useCallback(async () => {
    const [data] = await Promise.all([loadEntries(), loadToday()])
    return data
  }, [loadEntries, loadToday])

  // Around optimistic card changes (remove, move)
  const beginOptimistic = () => { optimistic.current.pending++; optimistic.current.gen++ }
  const endOptimistic = () => { optimistic.current.pending = Math.max(0, optimistic.current.pending - 1) }

  useEffect(() => { loadEntries(); loadNominations() }, [loadEntries, loadNominations])
  useEffect(() => { loadToday() }, [loadToday])

  // Planned evenings next week, for the "Nächste Woche planen" card
  useEffect(() => {
    if (!showPlanNextWeekCard) return
    const start = addDays(mondayOf(new Date()), 7)
    fetchRange(ds(start), ds(addDays(start, 6)))
      .then(data => setNextWeekPlanned(new Set(data.map(e => e.date)).size))
      .catch(() => setNextWeekPlanned(null))
  }, [showPlanNextWeekCard, entries])

  // "Neu": evenings the partner planned or changed (this week or next) since
  // this phone last looked. Runs when the plan opens and when the app comes
  // back; marked cards keep a "neu" badge until seen or for 24 h.
  const checkPartnerChanges = useCallback(async () => {
    if (!currentUser) return
    const key = `vommeal_lastseen_${currentUser}`
    const lastSeen = loadLastSeen(key)
    const monday = mondayOf(new Date())
    try {
      const { data, at } = await fetchRangeAt(ds(new Date()), ds(addDays(monday, 13)))
      const { planned, changed } = partnerChanges(data, currentUser, lastSeen)
      const fresh = [...planned, ...changed].map(e => e.id)
      const next = addMarks(loadMarks(currentUser), fresh, Date.now())
      saveMarks(currentUser, next)
      setMarks(next)
      const hint = partnerHint(planned, changed)
      if (hint) showToast(hint, { duration: 4000 })
      saveLastSeen(key, at)
    } catch { /* offline: try again on the next return */ }
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return
    if (pendingOpenSource.current) {
      track('week_next_open', { source: pendingOpenSource.current })
      pendingOpenSource.current = null
    }
    setMarks(loadMarks(currentUser))
    checkPartnerChanges()
  }, [currentUser, checkPartnerChanges])

  // Leaving the page (other app, other tab) counts as having seen the
  // cards of the week on screen: their "neu" badges go.
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  useEffect(() => {
    if (!currentUser) return
    const markSeen = () => {
      const ids = entriesRef.current.map(e => e.id)
      const next = dropMarks(loadMarks(currentUser), ids)
      saveMarks(currentUser, next)
    }
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return
      markSeen()
      setMarks(loadMarks(currentUser))
    }
    document.addEventListener('visibilitychange', onHide)
    return () => { document.removeEventListener('visibilitychange', onHide); markSeen() }
  }, [currentUser])

  // Back in the app: the partner may have planned meanwhile. Updates in
  // place, open sheets stay open.
  useRefreshOnResume(() => {
    loadEntries({ background: true })
    loadToday()
    loadNominations({ background: true })
    checkPartnerChanges()
  })

  const getEntry = (date: Date) => entries.find(e => e.date === ds(date))

  // In the current week, days before today collapse into a compact list
  const pastDays = isCurrentWeek ? days.filter(d => ds(d) < todayStr) : []
  const cardDays = isCurrentWeek ? days.filter(d => ds(d) >= todayStr) : days
  const freeUpcoming = days.filter(d => ds(d) >= todayStr && !getEntry(d))

  // ---- Picker -------------------------------------------------------------

  const openPicker = async (date: string, replaceId?: string) => {
    if (!ensureUser()) return
    setPicker({ date, replaceId })
    setSearch(''); setCustomName(''); setAddLeftovers(false); setNextDayFree(false); setKeepOld(null)
    const next = ds(addDays(parseISO(date), 1))
    if (next >= startStr && next <= endStr) {
      setNextDayFree(!entries.find(e => e.date === next))
    } else {
      try { setNextDayFree((await fetchRange(next, next)).length === 0) } catch { /* no toggle */ }
    }
  }

  const closePicker = () => { setPicker(null); setSearch(''); setCustomName(''); setAddLeftovers(false) }

  // Plans send what they expect on that evening (`expect_empty` or
  // `replace_id`); the server answers 409 with the current entry instead of
  // overwriting what the partner planned in the meantime.
  const postEntry = (body: Record<string, unknown>) =>
    apiCall<MealEntry>('/api/meal-plan', {
      method: 'POST',
      body: { meal_type: 'dinner', servings: SERVINGS, status: 'approved', suggested_by: currentUser, ...body },
      fallback: 'Konnte nicht gespeichert werden',
    })

  const conflictEntry = (res: { status: number; data: unknown }): MealEntry | null =>
    res.status === 409 ? ((res.data as { current?: MealEntry } | null)?.current ?? null) : null

  // "Susi hat inzwischen Shakshuka geplant"
  const conflictText = (current: MealEntry) =>
    current.suggested_by && current.suggested_by !== currentUser
      ? `${current.suggested_by} hat inzwischen ${mealName(current)} geplant`
      : `Inzwischen ist ${mealName(current)} geplant`

  // After a 409: show the fresh state and offer to replace it anyway.
  const offerReplace = (current: MealEntry, body: Record<string, unknown>, label: string) => {
    refresh()
    showToast(conflictText(current), {
      duration: 8000,
      action: {
        label: 'Trotzdem ersetzen',
        onClick: async () => {
          hideToast()
          const res = await postEntry({ ...body, replace_id: current.id })
          const again = conflictEntry(res)
          if (again) { offerReplace(again, body, label); return }
          if (!res.ok) { showToast(res.error); return }
          track('plan_replace')
          refresh()
          showToast(`${fmt(parseISO(String(body.date)), 'EEEE')}: ${label}`)
        },
      },
    })
  }

  const planMeal = async (opts: { recipeId?: string; name?: string; quick?: boolean; label?: string }) => {
    if (!picker || saving) return
    const { date, replaceId } = picker
    const name = opts.name ?? customName.trim()
    if (!opts.recipeId && !name) return
    const replaced = replaceId ? entries.find(e => e.id === replaceId) : undefined
    const keep = !!replaced && (keepOld ?? (date === todayStr && !!opts.quick && KEEP_OLD_BY_DEFAULT.includes(name)))
    if (replaced && keep) { await replaceKeepingOld(replaced, opts, name); return }
    const label = opts.label || (opts.recipeId ? recipes.find(r => r.id === opts.recipeId)?.name || 'Rezept' : name)
    const body = { date, recipe_id: opts.recipeId || null, custom_meal_name: opts.recipeId ? null : name }
    setSaving(true)
    try {
      const res = await postEntry({ ...body, ...(replaceId ? { replace_id: replaceId } : { expect_empty: true }) })
      const current = conflictEntry(res)
      if (current) { closePicker(); offerReplace(current, body, label); return }
      if (!res.ok) { showToast(res.error); return }
      track(replaceId ? 'plan_replace' : 'plan_add', replaceId ? {} : { quick: !!opts.quick })

      let leftovers = false
      if (addLeftovers && nextDayFree && !opts.quick && !keep) {
        const next = ds(addDays(parseISO(date), 1))
        const r = await postEntry({ date: next, recipe_id: null, custom_meal_name: LEFTOVERS, expect_empty: true })
        if (r.ok) { leftovers = true; track('plan_leftovers') }
      }
      closePicker()
      refresh()
      showToast(leftovers ? `${label} + Reste morgen` : `${fmt(parseISO(date), 'EEEE')}: ${label}`)
    } finally {
      setSaving(false)
    }
  }

  // Replace, but keep the old dish: it (and the evenings right after it) move
  // one day later, then the new choice goes onto the freed evening.
  const replaceKeepingOld = async (replaced: MealEntry, opts: { recipeId?: string; quick?: boolean; label?: string }, name: string) => {
    const date = replaced.date
    setSaving(true)
    try {
      const res = await shiftPlan({ from: date, days: 1, fill: opts.quick ? name : null, suggested_by: currentUser })
      let createdId = res.filled?.id ?? null
      if (!opts.quick) {
        // The shift just freed this evening; anything there now came from elsewhere.
        const r = await postEntry({ date, recipe_id: opts.recipeId || null, custom_meal_name: opts.recipeId ? null : name, expect_empty: true })
        if (!r.ok) {
          await undoPlanChange(res.moves, null, currentUser).catch(() => {})
          const current = conflictEntry(r)
          throw new Error(current ? conflictText(current) : r.error)
        }
        createdId = r.data.id ?? null
      }
      track('plan_replace')
      track('plan_shift', { days: 1, filled: true, via: 'picker' })
      closePicker()
      const label = opts.label || (opts.recipeId ? recipes.find(r => r.id === opts.recipeId)?.name || 'Rezept' : name)
      afterPlanChange(res.moves, createdId, `${label} · ${mealName(replaced)} → ${fmt(addDays(parseISO(date), 1), 'EEEEEE')}`)
    } catch (e) {
      showToast(errorText(e, 'Konnte nicht gespeichert werden'))
    } finally {
      setSaving(false)
    }
  }

  // An existing recipe with the typed name, if any (avoids duplicates, also in Mealie)
  const sameNameRecipe = (name: string) => {
    const n = normName(name)
    return n ? recipes.find(r => normName(r.name) === n) : undefined
  }

  // Enter never creates a recipe: it plans an existing one with that exact
  // name, otherwise it does nothing and the buttons below decide.
  const onCustomNameEnter = () => {
    const existing = sameNameRecipe(customName)
    if (existing) planMeal({ recipeId: existing.id, label: existing.name })
  }

  // Free text → new recipe in Mealie (dinner category), then planned like any recipe.
  const createRecipeAndPlan = async () => {
    const name = customName.trim()
    if (!name || saving || creatingRecipe) return
    const existing = sameNameRecipe(name)
    if (existing) {
      await planMeal({ recipeId: existing.id, label: `${existing.name}, Rezept gab es schon` })
      return
    }
    setCreatingRecipe(true)
    try {
      const res = await fetch('/api/recipes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.id) {
        showToast(data?.error || 'Rezept konnte nicht angelegt werden')
        return
      }
      setRecipes(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'de')))
      track('recipe_create', { from: 'picker', source: data.source })
      await planMeal({ recipeId: data.id, label: data.name })
    } catch {
      showToast('Rezept konnte nicht angelegt werden')
    } finally {
      setCreatingRecipe(false)
    }
  }

  // ---- Plan actions ------------------------------------------------------

  // Optimistic removal with a 6 s undo window instead of a confirm dialog
  const removeEntry = async (id: string) => {
    const removed = entries.find(e => e.id === id)
    if (!removed) return
    setEntries(prev => prev.filter(e => e.id !== id))
    beginOptimistic()
    const res = await apiCall(`/api/meal-plan/${id}`, { method: 'DELETE', fallback: 'Konnte nicht entfernt werden' })
    endOptimistic()
    if (!res.ok) {
      // 404: the partner removed or replaced it already; show the fresh state.
      if (res.status === 404) { refresh(); showToast('Wurde inzwischen geändert'); return }
      // Put back only this card, other changes since then stay.
      setEntries(prev => prev.some(e => e.id === id) ? prev : [...prev, removed].sort((a, b) => a.date.localeCompare(b.date)))
      showToast(res.status === 0 ? `${NETWORK_ERROR}, ${mealName(removed)} bleibt` : res.error)
      return
    }
    track('plan_remove')
    if (removed.date === todayStr) setTodayEntry(null)
    showToast(`${mealName(removed)} entfernt`, {
      duration: 6000,
      action: {
        label: 'Rückgängig',
        onClick: async () => {
          hideToast()
          // Only onto a still free evening: never overwrite a newer plan.
          const r = await postEntry({
            id: removed.id, date: removed.date,
            recipe_id: removed.recipe_id, custom_meal_name: removed.custom_meal_name,
            servings: removed.servings || SERVINGS, notes: removed.notes,
            suggested_by: removed.suggested_by, expect_empty: true,
          })
          const current = conflictEntry(r)
          if (r.ok) { refresh(); showToast('Wiederhergestellt') }
          else if (current) { refresh(); showToast(`Nicht wiederhergestellt: ${conflictText(current)}`, { duration: 4000 }) }
          else { showToast(r.status === 0 ? r.error : 'Konnte nicht wiederhergestellt werden') }
        },
      },
    })
  }

  // ---- Moving evenings ----------------------------------------------------

  // Toast with a 6 s undo that restores the old dates (and removes an evening
  // that was planned on the freed day).
  const afterPlanChange = (moves: PlanMove[], createdId: string | null | undefined, msg: string) => {
    refresh()
    showToast(msg, {
      duration: 6000,
      action: {
        label: 'Rückgängig',
        onClick: async () => {
          hideToast()
          try {
            await undoPlanChange(moves, createdId, currentUser)
            showToast('Zurückgenommen')
          } catch (e) {
            showToast(errorText(e, 'Konnte nicht zurückgenommen werden'))
          }
          refresh()
        },
      },
    })
  }

  const shiftEntry = async (entry: MealEntry, days: 1 | -1, fillEatingOut: boolean) => {
    if (moving) return
    setMoving(true)
    try {
      const res = await shiftPlan({
        from: entry.date, days, fill: days === 1 && fillEatingOut ? EATING_OUT : null, suggested_by: currentUser,
      })
      track('plan_shift', { days, filled: !!res.filled })
      setMoveFor(null)
      afterPlanChange(res.moves, res.filled?.id, 'Verschoben')
    } catch (e) {
      showToast(errorText(e, 'Konnte nicht verschoben werden'))
      refresh()
    } finally {
      setMoving(false)
    }
  }

  const moveEntryTo = async (id: string, to: string, via: 'sheet' | 'drag') => {
    if (moving) return
    // Optimistic: show the new order right away, the server confirms it.
    const local = planMove(entries, id, to)
    if (local.ok) setEntries(prev => applyMoves(prev, local.moves))
    setMoving(true)
    beginOptimistic()
    try {
      const { moves } = await movePlanEntry(id, to, currentUser)
      endOptimistic()
      const swap = moves.length > 1
      track(via === 'drag' ? 'plan_drag' : 'plan_move', { swap })
      setMoveFor(null)
      afterPlanChange(moves, null, swap ? 'Getauscht' : 'Verschoben')
    } catch (e) {
      endOptimistic()
      showToast(errorText(e, 'Konnte nicht verschoben werden'))
      refresh()
    } finally {
      setMoving(false)
    }
  }

  const drag = useLongPressDrag({
    onDrop: ({ id, to }: DragDrop) => { moveEntryTo(id, to, 'drag') },
    canDrop: date => date >= todayStr,
  })

  const autofillWeek = async () => {
    if (!currentUser) { askUser(); return }
    setAutofilling(true)
    const before = new Set(entries.map(e => e.id))
    try {
      const res = await fetch('/api/meal-plan/autofill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: upcomingStartStr, end: endStr, suggested_by: currentUser }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) { showToast(data.error || 'Woche konnte nicht gefüllt werden'); return }
      track('autofill', { filled: data.filled ?? 0 })
      if (!data.filled) { showToast('Alle Abende sind schon geplant'); return }
      const fresh = await refresh()
      loadNominations()
      const added = (fresh || []).filter(e => !before.has(e.id) && e.date >= upcomingStartStr)
      showToast(`${abende(data.filled)} gefüllt`, {
        duration: 6000,
        action: added.length ? {
          label: 'Rückgängig',
          onClick: async () => {
            hideToast()
            // 404 = already removed or replaced by the partner: nothing to undo there.
            const results = await Promise.all(added.map(e => apiCall(`/api/meal-plan/${e.id}`, { method: 'DELETE' })))
            refresh()
            const failed = results.find(r => !r.ok && r.status !== 404)
            showToast(failed ? (failed.status === 0 ? failed.error : 'Konnte nicht zurückgenommen werden') : 'Zurückgenommen')
          },
        } : undefined,
      })
    } catch {
      showToast('Woche konnte nicht gefüllt werden')
    } finally {
      setAutofilling(false)
    }
  }

  const addToList = async (date: string) => {
    setAddingToList(date)
    const res = await apiCall<{ added?: number }>('/api/shopping', {
      method: 'POST',
      body: { action: 'add_date', date },
      fallback: 'Zutaten konnten nicht übernommen werden',
    })
    setAddingToList(null)
    if (!res.ok) { showToast(res.error); return }
    const added = res.data?.added ?? 0
    track('shopping_from_plan', { scope: 'day', added })
    showToast(added > 0 ? `${added} Zutaten auf die Einkaufsliste` : 'Schon alles auf der Liste')
  }

  const generateShopping = async () => {
    if (upcomingStartStr > endStr) { showToast('Diese Woche ist schon vorbei'); return }
    setAddingToList('week')
    const res = await apiCall<{ added?: number }>('/api/shopping', {
      method: 'POST',
      body: { action: 'generate', start: upcomingStartStr, end: endStr },
      fallback: 'Zutaten konnten nicht übernommen werden',
    })
    setAddingToList(null)
    if (!res.ok) { showToast(res.error); return }
    const added = res.data?.added ?? 0
    track('shopping_from_plan', { scope: 'week', added })
    showToast(added > 0 ? `${added} Zutaten auf die Einkaufsliste` : 'Schon alles auf der Liste')
  }

  // Clears from today on only: past evenings are history (14-day rule,
  // "Wie war's?"). No confirm, but an undo that restores onto free evenings.
  const clearWeek = async () => {
    if (clearing || upcomingStartStr > endStr) return
    setClearing(true)
    const range = `start=${upcomingStartStr}&end=${endStr}`
    const [plan, noms] = await Promise.all([
      apiCall<{ removed?: MealEntry[] }>(`/api/meal-plan?${range}`, { method: 'DELETE', fallback: 'Woche konnte nicht geleert werden' }),
      apiCall<{ removed?: Nomination[] }>(`/api/nominations?${range}`, { method: 'DELETE', fallback: 'Stimmen konnten nicht gelöscht werden' }),
    ])
    setClearing(false)
    await refresh()
    await loadNominations()
    const removed = plan.ok ? plan.data?.removed ?? [] : []
    const removedNoms = noms.ok ? noms.data?.removed ?? [] : []
    if (!plan.ok || !noms.ok) {
      showToast(!plan.ok ? plan.error : noms.error)
      return
    }
    track('plan_clear', { removed: removed.length })
    const what = upcomingStartStr > startStr ? 'Rest der Woche' : 'Woche'
    showToast(removed.length > 0 ? `${what} geleert: ${abende(removed.length)}` : `${what} geleert`, {
      duration: 8000,
      action: removed.length + removedNoms.length > 0 ? {
        label: 'Rückgängig',
        onClick: () => { hideToast(); restoreCleared(removed, removedNoms) },
      } : undefined,
    })
  }

  // Undo for "Woche leeren": each evening only comes back if it is still free.
  const restoreCleared = async (removed: MealEntry[], removedNoms: Nomination[]) => {
    const results = await Promise.all(removed.map(e => postEntry({
      id: e.id, date: e.date, recipe_id: e.recipe_id, custom_meal_name: e.custom_meal_name,
      servings: e.servings || SERVINGS, notes: e.notes, suggested_by: e.suggested_by, expect_empty: true,
    })))
    await Promise.all(removedNoms.map(n => apiCall('/api/nominations', {
      method: 'POST',
      body: { date: n.date, recipe_id: n.recipe_id, user_name: n.user_name },
    })))
    await refresh()
    await loadNominations()
    const taken = results.filter(r => r.status === 409).length
    const failed = results.find(r => !r.ok && r.status !== 409)
    if (failed) showToast(failed.status === 0 ? failed.error : 'Konnte nicht wiederhergestellt werden')
    else if (taken > 0) showToast(`${abende(taken)} inzwischen neu geplant, dort nichts überschrieben`, { duration: 4000 })
    else showToast('Wiederhergestellt')
  }

  // ---- Fun mode ("Swipen") -------------------------------------------------

  const getCardsForDate = (dateStr: string): Recipe[] =>
    seededShuffle(recipes, dateStr).slice(0, CARDS_PER_DAY)

  const openFunMode = () => {
    if (!currentUser) { askUser(); return }
    // Pre-select empty days that are still ahead of us
    setFunSelectedDates(new Set(freeUpcoming.map(ds)))
    setFunDayPicker(true)
    track('fun_open')
  }

  const startFunMode = () => {
    setFunDayPicker(false)
    setFunDayIndex(0)
    setFunCardIndex(0)
    setFunDone(false)
    setFunMode(true)
  }

  const funDays = days.filter(d => {
    const s = ds(d)
    if (funSelectedDates.size > 0) return funSelectedDates.has(s)
    return !entries.find(e => e.date === s)
  })

  const finishFunMode = async () => {
    // Wait for any in-flight votes so the results screen is complete
    await Promise.allSettled(pendingVotes.current)
    pendingVotes.current = []
    await loadEntries()
    await loadNominations()
    setFunDone(true)
  }

  const advanceFunCard = () => {
    const nextCard = funCardIndex + 1
    if (nextCard < CARDS_PER_DAY) { setFunCardIndex(nextCard); return }
    const nextDay = funDayIndex + 1
    if (nextDay >= funDays.length) finishFunMode()
    else { setFunDayIndex(nextDay); setFunCardIndex(0) }
  }

  // Each "Ja" is saved immediately so closing Swipen mid-way loses nothing
  const funVote = (recipe: Recipe, yes: boolean) => {
    const dateStr = ds(funDays[funDayIndex])
    track('fun_vote', { yes })
    advanceFunCard()
    if (!yes) return
    const post = fetch('/api/nominations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr, recipe_id: recipe.id, user_name: currentUser }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.match) {
          showToast(`❤️ Match: ${recipe.name} am ${fmt(parseISO(dateStr), 'EEEE')}!`, { duration: 4000 })
          refresh()
          loadNominations()
        }
      })
      .catch(() => showToast('Stimme konnte nicht gespeichert werden'))
    pendingVotes.current.push(post)
  }

  const closeFunMode = () => {
    setFunMode(false)
    refresh()
    loadNominations()
  }

  const resolveConflict = async (dateStr: string, recipeId: string) => {
    await fetch('/api/nominations/pick', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr, recipe_id: recipeId }),
    })
    await refresh()
    await loadNominations()
    setSettleDate(null)
  }

  const filteredRecipes = recipes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  const title = isCurrentWeek ? 'Diese Woche' : isNextWeek ? 'Nächste Woche' : rangeLabel(weekStart, addDays(weekStart, 6))
  const subtitle = isCurrentWeek || isNextWeek ? rangeLabel(weekStart, addDays(weekStart, 6)) : `KW ${fmt(weekStart, 'I')}`

  return (
    <div className="space-y-5">
      {loadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {loadError}
        </div>
      )}

      {/* Heute — slim row while another week is shown */}
      {!isCurrentWeek && (
        todayEntry ? (
          <Link href="/tonight"
            className="flex items-center gap-3 min-h-[48px] px-3 py-2 rounded-xl border border-[#222] bg-[#111] hover:bg-[#161616] transition-all">
            <MealThumb entry={todayEntry} size="w-8 h-8" />
            <p className="flex-1 min-w-0 truncate text-sm">
              <span className="font-semibold text-primary">Heute: </span>
              <span className="text-white">{mealName(todayEntry)}</span>
            </p>
            <ChevronRight size={16} className="text-ink-hint flex-shrink-0" />
          </Link>
        ) : (
          <button onClick={() => openPicker(todayStr)}
            className="w-full flex items-center gap-3 min-h-[48px] px-3 py-2 rounded-xl border border-[#222] bg-[#111] hover:bg-[#161616] text-left transition-all">
            <div className="w-8 h-8 rounded-lg bg-[#1e1e1e] flex items-center justify-center flex-shrink-0">🍽️</div>
            <p className="flex-1 min-w-0 truncate text-sm">
              <span className="font-semibold text-primary">Heute: </span>
              <span className="text-ink-muted">noch nichts geplant</span>
            </p>
            <Plus size={16} className="text-ink-muted flex-shrink-0" />
          </button>
        )
      )}

      {/* Header: title + week navigation */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white truncate">{title}</h1>
          <p className="flex items-center gap-1.5 text-sm text-ink-muted mt-0.5">
            {subtitle}
            {/* Who plans on this phone; changed in Einstellungen */}
            {currentUser && <Avatar name={currentUser} users={users} size="xs" />}
          </p>
        </div>
        <div className="flex items-center flex-shrink-0">
          <button onClick={() => goToWeek(addDays(weekStart, -7), 'nav')} aria-label="Vorherige Woche"
            className={`${iconBtn} text-ink-muted hover:text-white hover:bg-[#1c1c1c]`}>
            <ChevronLeft size={20} />
          </button>
          {!isCurrentWeek && (
            <button onClick={() => goToWeek(currentMonday)}
              className="min-h-[40px] px-3 rounded-lg text-sm font-medium bg-[#1c1c1c] hover:bg-[#252525] text-ink-soft hover:text-white transition-all border border-[#2a2a2a]">
              Heute
            </button>
          )}
          <button onClick={() => goToWeek(addDays(weekStart, 7), 'nav')} aria-label="Nächste Woche"
            className={`${iconBtn} text-ink-muted hover:text-white hover:bg-[#1c1c1c]`}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Actions: one primary, two secondary */}
      <div className="space-y-2">
        {!loading && freeUpcoming.length > 0 && (
          <button onClick={autofillWeek} disabled={autofilling}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-base font-semibold shadow-lg shadow-primary/10 transition-all disabled:opacity-60">
            <Zap size={18} className={autofilling ? 'animate-pulse' : ''} />
            {autofilling ? 'Wird gefüllt…' : `${freeUpcoming.length} ${freeUpcoming.length === 1 ? 'freien Abend' : 'freie Abende'} füllen`}
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="flex-1" />
          <button onClick={openFunMode} className={secondaryBtn}>
            <Dices size={16} /> Swipen
          </button>
          <button onClick={generateShopping} disabled={addingToList === 'week'} className={secondaryBtn}
            title="Zutaten der kommenden Abende auf die Einkaufsliste">
            <ShoppingCart size={16} /> Zutaten
          </button>
        </div>
      </div>

      {/* Earlier this week — compact, collapsed rows for days already over */}
      {pastDays.length > 0 && (
        <div className="rounded-xl border border-[#1e1e1e] bg-[#0f0f0f] overflow-hidden">
          <button
            onClick={() => setEarlierOpen(o => !o)}
            aria-expanded={earlierOpen}
            className="w-full min-h-[44px] flex items-center justify-between px-3 text-left hover:bg-[#141414] transition-colors"
          >
            <span className="text-sm font-medium text-ink-muted">
              Vorbei
              <span className="ml-1.5 text-ink-hint">· {pastDays.length} {pastDays.length === 1 ? 'Tag' : 'Tage'}</span>
            </span>
            <ChevronDown size={16} className={`text-ink-hint transition-transform ${earlierOpen ? 'rotate-180' : ''}`} />
          </button>
          {earlierOpen && (
            <div className="border-t border-[#1a1a1a] divide-y divide-[#161616]">
              {pastDays.map(day => {
                const entry = getEntry(day)
                const dateStr = ds(day)
                return (
                  <div key={dateStr} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-16 flex-shrink-0 text-ink-hint font-medium">{fmt(day, 'EEE d.')}</span>
                    {entry ? (
                      entry.recipe_id ? (
                        <Link href={`/recipes/${entry.recipe_id}`} className="flex-1 min-w-0 truncate text-ink-muted hover:text-white transition-colors">
                          {mealName(entry)}
                        </Link>
                      ) : (
                        <span className="flex-1 min-w-0 truncate text-ink-muted">
                          {quickMealEmoji(entry.custom_meal_name) ? `${quickMealEmoji(entry.custom_meal_name)} ` : ''}{mealName(entry)}
                        </span>
                      )
                    ) : (
                      <span className="flex-1 min-w-0 truncate text-ink-hint italic">nichts geplant</span>
                    )}
                    {entry?.suggested_by && <Avatar name={entry.suggested_by} users={users} size="xs" />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Days (planned cards can be long-pressed and dragged onto another day) */}
      <div ref={drag.containerRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {cardDays.map(day => {
          const entry = getEntry(day)
          const dateStr = ds(day)
          const today = isToday(day)
          const past = dateStr < todayStr
          const dayLabel = today ? 'Heute' : fmt(day, 'EEEE')
          const dropOver = drag.overDate === dateStr

          if (loading) {
            return <div key={dateStr} className="skeleton h-[60px] rounded-xl" />
          }

          if (entry) {
            const lifted = drag.dragId === entry.id
            return (
              <div key={dateStr} data-drop-date={dateStr} {...drag.bind(entry.id, dateStr, !past)}
                className={`relative rounded-xl border overflow-hidden select-none [-webkit-touch-callout:none] ${
                  dropOver ? 'border-primary bg-primary/10 ring-2 ring-primary/60'
                    : today ? 'border-primary/50 bg-[#141414]' : 'border-[#232323] bg-[#141414]'
                } ${lifted ? 'shadow-2xl shadow-black/80 ring-2 ring-primary/70 cursor-grabbing' : ''}`}>
                {dropOver && <span className={dropBadge}>tauschen</span>}
                <div className="flex items-center gap-3 p-2.5 pb-1">
                  <MealThumb entry={entry} size="w-14 h-14" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold ${today ? 'text-primary' : 'text-ink-muted'}`}>
                      {dayLabel} <span className="font-normal text-ink-hint">{fmt(day, 'd.M.')}</span>
                      {marks[entry.id] && (
                        <span title={`Neu von ${entry.updated_by || entry.suggested_by}`}
                          className="ml-1.5 inline-flex items-center gap-1 align-middle px-1.5 rounded-full bg-primary/15 text-[10px] font-semibold leading-4 text-primary">
                          <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-primary" />neu
                        </span>
                      )}
                    </p>
                    {entry.recipe_id ? (
                      <Link href={`/recipes/${entry.recipe_id}`} draggable={false}
                        className="block text-[15px] font-semibold text-white leading-snug line-clamp-2 hover:text-primary transition-colors">
                        {mealName(entry)}
                      </Link>
                    ) : (
                      <p className="text-[15px] font-semibold text-white leading-snug line-clamp-2">{mealName(entry)}</p>
                    )}
                    {entry.recipe?.rating ? <StarRating rating={entry.recipe.rating} size={12} /> : null}
                  </div>
                </div>
                <div className="flex items-center gap-1 pl-2.5 pr-1 pb-1">
                  {entry.suggested_by ? (
                    <span className="flex items-center gap-1.5 text-xs text-ink-hint min-w-0 flex-1">
                      <Avatar name={entry.suggested_by} users={users} />
                      <span className="truncate">{entry.suggested_by}</span>
                    </span>
                  ) : <span className="flex-1" />}
                  {entry.recipe_id && (
                    <button onClick={() => addToList(dateStr)} disabled={addingToList === dateStr}
                      aria-label="Zutaten auf die Einkaufsliste" title="Zutaten auf die Einkaufsliste"
                      className={`${iconBtn} text-ink-muted hover:text-primary hover:bg-[#1c1c1c] disabled:opacity-50`}>
                      <ShoppingCart size={16} />
                    </button>
                  )}
                  <button onClick={() => setMoveFor(entry)} aria-label={`${mealName(entry)} verschieben`} title="Verschieben"
                    className={`${iconBtn} text-ink-muted hover:text-white hover:bg-[#1c1c1c]`}>
                    <CalendarClock size={17} />
                  </button>
                  <button onClick={() => openPicker(dateStr, entry.id)}
                    className="min-h-[40px] flex items-center gap-1.5 px-2.5 rounded-lg text-sm text-ink-soft hover:text-white hover:bg-[#1c1c1c] transition-all">
                    <ArrowLeftRight size={15} /> Tauschen
                  </button>
                  <button onClick={() => removeEntry(entry.id)} aria-label={`${mealName(entry)} entfernen`}
                    className={`${iconBtn} text-ink-muted hover:text-red-400 hover:bg-[#1c1c1c]`}>
                    <X size={18} />
                  </button>
                </div>
              </div>
            )
          }

          // Empty day: votes from Swipen, or a compact "plan" row
          const dayNoms = nominations.filter(n => n.date === dateStr)
          const myNoms = dayNoms.filter(n => n.user_name === currentUser)
          const partnerNoms = dayNoms.filter(n => n.user_name !== currentUser)
          const partnerIds = new Set(partnerNoms.map(n => n.recipe_id))
          const hasMatch = myNoms.some(n => partnerIds.has(n.recipe_id))
          const dayHead = (
            <span className={`w-20 flex-shrink-0 text-sm font-semibold ${today ? 'text-primary' : 'text-ink-soft'}`}>
              {today ? 'Heute' : fmt(day, 'EEE d.')}
            </span>
          )

          if (dayNoms.length > 0) {
            return (
              <div key={dateStr} data-drop-date={dateStr} className={`relative flex items-center gap-2 min-h-[56px] pl-3 pr-1.5 py-1.5 rounded-xl border border-dashed ${
                dropOver ? 'border-primary bg-primary/10 ring-2 ring-primary/60' : today ? 'border-primary/50 bg-[#101010]' : 'border-[#2c2c2c] bg-[#101010]'
              }`}>
                {dropOver && <span className={dropBadge}>hierher</span>}
                {dayHead}
                <button onClick={() => setSettleDate(dateStr)}
                  className={`flex-1 min-h-[40px] flex items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-all ${
                    hasMatch
                      ? 'bg-pink-500/15 hover:bg-pink-500/25 border-pink-500/30 text-pink-300'
                      : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-300'
                  }`}>
                  {hasMatch ? '❤️ Match ansehen' : `⚖️ ${dayNoms.length} ${dayNoms.length === 1 ? 'Stimme' : 'Stimmen'}`}
                </button>
                <button onClick={() => openPicker(dateStr)} aria-label="Abendessen planen"
                  className={`${iconBtn} text-ink-muted hover:text-white hover:bg-[#1c1c1c]`}>
                  <Plus size={18} />
                </button>
              </div>
            )
          }

          return (
            <button key={dateStr} data-drop-date={dateStr} onClick={() => openPicker(dateStr)} disabled={past}
              className={`relative w-full flex items-center gap-2 min-h-[52px] px-3 rounded-xl border border-dashed text-left transition-all ${
                dropOver ? 'border-primary bg-primary/10 ring-2 ring-primary/60'
                  : today ? 'border-primary/50 bg-primary/5' : 'border-[#2c2c2c] bg-[#101010]'
              } hover:bg-[#181818] disabled:opacity-50`}>
              {dropOver && <span className={dropBadge}>hierher</span>}
              {dayHead}
              <span className="flex-1 flex items-center gap-1.5 text-sm font-medium text-ink-soft">
                <Plus size={16} className="text-primary" /> {past ? 'nichts geplant' : 'Abendessen planen'}
              </span>
            </button>
          )
        })}
      </div>

      {/* Thursday onwards: nudge towards next week */}
      {showPlanNextWeekCard && (
        <button onClick={() => goToWeek(addDays(currentMonday, 7), 'card')}
          className="w-full flex items-center gap-3 p-4 rounded-2xl border border-primary/40 bg-primary/10 hover:bg-primary/15 text-left transition-all">
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-white">Nächste Woche planen</p>
            <p className="text-sm text-ink-soft mt-0.5">
              {rangeLabel(addDays(currentMonday, 7), addDays(currentMonday, 13))}
              {nextWeekPlanned !== null && ` · ${nextWeekPlanned === 0 ? 'noch nichts geplant' : `${nextWeekPlanned} von 7 geplant`}`}
            </p>
          </div>
          <ArrowRight size={22} className="text-primary flex-shrink-0" />
        </button>
      )}

      {/* Clear week: only what is still ahead, past weeks are never cleared */}
      {(entries.some(e => e.date >= upcomingStartStr) || nominations.some(n => n.date >= upcomingStartStr)) && (
        <div className="flex justify-center pt-2">
          <button onClick={clearWeek} disabled={clearing}
            className="min-h-[40px] text-sm text-ink-hint hover:text-red-400 transition-colors px-4 disabled:opacity-50">
            {upcomingStartStr > startStr ? 'Ab heute leeren' : 'Woche leeren'}
          </button>
        </div>
      )}

      {/* Add / replace sheet */}
      {picker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) closePicker() }}>
          <div className="w-full max-w-md max-h-[90dvh] flex flex-col bg-[#141414] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl animate-slide-up pb-safe">
            <div className="flex items-center justify-between pl-4 pr-2 py-2 border-b border-[#222] flex-shrink-0">
              <div className="min-w-0">
                <p className="font-semibold text-white">{picker.replaceId ? 'Gericht tauschen' : 'Abendessen planen'}</p>
                <p className="text-sm text-ink-muted">{fmt(parseISO(picker.date), 'EEEE, d. MMMM')}</p>
              </div>
              <button onClick={closePicker} aria-label="Schließen"
                className={`${iconBtn} text-ink-muted hover:text-white hover:bg-[#222]`}>
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto">
              {/* Replace mode: keep the old dish by moving it one day later */}
              {picker.replaceId && (() => {
                const replaced = entries.find(e => e.id === picker.replaceId)
                if (!replaced) return null
                const nextLabel = picker.date === todayStr ? 'morgen' : fmt(addDays(parseISO(picker.date), 1), 'EEEE')
                const auto = keepOld === null && picker.date === todayStr
                return (
                  <label className="flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-xl bg-[#1a1a1a] border border-[#262626] cursor-pointer">
                    <CalendarClock size={18} className="text-primary flex-shrink-0" />
                    <span className="flex-1 text-sm text-ink-soft">
                      {mealName(replaced)} nicht verwerfen, sondern auf {nextLabel} schieben
                      <span className="block text-xs text-ink-hint">
                        Der Rest rutscht mit{auto ? ' · bei Auswärts essen oder Bestellen automatisch' : ''}
                      </span>
                    </span>
                    <input type="checkbox" checked={keepOld ?? false} onChange={e => setKeepOld(e.target.checked)}
                      className="sr-only peer" />
                    <span aria-hidden className="relative flex-shrink-0 w-11 h-6 rounded-full bg-[#333] peer-checked:bg-primary transition-colors after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
                  </label>
                )
              })()}

              {/* Quick options */}
              <div className="grid grid-cols-2 gap-2">
                {QUICK_MEALS.map(q => (
                  <button key={q.name} onClick={() => planMeal({ name: q.name, quick: true })} disabled={saving}
                    className="min-h-[44px] flex items-center gap-2 px-3 rounded-xl bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-sm font-medium text-white text-left transition-all disabled:opacity-50">
                    <span className="text-lg">{q.emoji}</span> {q.name}
                  </button>
                ))}
              </div>

              {/* Free text: new recipe in Mealie (default) or just a note for the evening */}
              <div className="space-y-2">
                <input placeholder="Neues Gericht, z. B. Schnitzel…" value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCustomNameEnter() } }}
                  enterKeyHint="done"
                  className="text-base min-h-[44px]" />
                {customName.trim() && (
                  <div className="flex gap-2">
                    <button onClick={createRecipeAndPlan} disabled={saving || creatingRecipe}
                      className="flex-1 min-h-[44px] px-3 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-all disabled:opacity-50">
                      {creatingRecipe ? 'Lege an…' : sameNameRecipe(customName) ? 'Vorhandenes Rezept planen' : 'Als Rezept anlegen & planen'}
                    </button>
                    <button onClick={() => planMeal({})} disabled={saving || creatingRecipe}
                      className="min-h-[44px] px-3 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-sm text-ink-soft flex-shrink-0 transition-all disabled:opacity-50">
                      Nur Notiz
                    </button>
                  </div>
                )}
                {customName.trim() && (
                  <p className="text-xs text-ink-hint">
                    {sameNameRecipe(customName)
                      ? `„${sameNameRecipe(customName)!.name}“ gibt es schon als Rezept und wird eingeplant.`
                      : 'Das Rezept landet in Mealie. Zutaten und Schritte könnt ihr später dort ergänzen.'}
                  </p>
                )}
              </div>

              {/* Leftovers for tomorrow (not when tomorrow gets the old dish) */}
              {nextDayFree && !keepOld && (
                <label className="flex items-center gap-3 min-h-[44px] px-3 rounded-xl bg-[#1a1a1a] border border-[#262626] cursor-pointer">
                  <span className="text-lg">🍲</span>
                  <span className="flex-1 text-sm text-ink-soft">
                    Reste für morgen einplanen
                    <span className="block text-xs text-ink-hint">{fmt(addDays(parseISO(picker.date), 1), 'EEEE')} ist noch frei</span>
                  </span>
                  <input type="checkbox" checked={addLeftovers} onChange={e => setAddLeftovers(e.target.checked)}
                    className="sr-only peer" />
                  <span aria-hidden className="relative w-11 h-6 rounded-full bg-[#333] peer-checked:bg-primary transition-colors after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
                </label>
              )}

              {/* Recipe search */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-hint" />
                <input placeholder="Rezepte suchen…" value={search} onChange={e => setSearch(e.target.value)}
                  className="pl-9 text-base min-h-[44px]" />
              </div>
              <div className="space-y-1">
                {filteredRecipes.length === 0 && <p className="text-center text-ink-muted text-sm py-4">Keine Rezepte gefunden</p>}
                {filteredRecipes.map(r => {
                  const mins = (r.prep_time || 0) + (r.cook_time || 0)
                  return (
                    <button key={r.id} onClick={() => planMeal({ recipeId: r.id })} disabled={saving}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[#1e1e1e] border border-transparent hover:border-[#2a2a2a] text-left transition-all disabled:opacity-50">
                      <MealThumb recipe={r} size="w-10 h-10" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{r.name}</p>
                        <p className="text-xs text-ink-hint">
                          {r.effort === 'quick' ? '⚡ schnell' : r.effort === 'involved' ? 'aufwendig' : r.source === 'mealie' ? 'Mealie' : 'Eigenes Rezept'}
                          {mins ? ` · ${mins} Min.` : ''}
                        </p>
                      </div>
                      {r.rating ? <StarRating rating={r.rating} size={11} /> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Verschieben sheet */}
      {moveFor && (
        <MoveSheet
          entry={{ id: moveFor.id, date: moveFor.date, name: mealName(moveFor) }}
          weekStart={startStr}
          today={todayStr}
          busy={moving}
          onClose={() => setMoveFor(null)}
          onShift={(days, fillEatingOut) => shiftEntry(moveFor, days, fillEatingOut)}
          onMoveTo={date => moveEntryTo(moveFor.id, date, 'sheet')}
        />
      )}

      {/* Swipen overlay */}
      {funMode && (() => {
        const emptyDays = funDays

        if (emptyDays.length === 0) return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-8 max-w-sm w-full text-center">
              <div className="text-4xl mb-4">🎉</div>
              <p className="text-white font-semibold text-lg">Alles geplant!</p>
              <p className="text-ink-muted text-sm mt-1 mb-6">Diese Woche gibt es nichts mehr zu swipen.</p>
              <button onClick={closeFunMode} className="min-h-[44px] px-6 rounded-lg bg-primary text-white text-sm font-medium">Fertig</button>
            </div>
          </div>
        )

        // Results screen after voting all days
        if (funDone) {
          const byDate = emptyDays.map(d => {
            const dateStr = ds(d)
            const dayNoms = nominations.filter(n => n.date === dateStr)
            const myNoms = dayNoms.filter(n => n.user_name === currentUser)
            const partnerNoms = dayNoms.filter(n => n.user_name !== currentUser)
            const partnerIds = new Set(partnerNoms.map(n => n.recipe_id))
            const matchId = myNoms.find(n => partnerIds.has(n.recipe_id))?.recipe_id
            const confirmed = entries.find(e => e.date === dateStr)
            return { dateStr, day: d, myNoms, partnerNoms, matchId, confirmed }
          })

          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4">
              <div className="w-full max-w-sm bg-[#141414] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl animate-slide-up max-h-[90dvh] flex flex-col pb-safe">
                <div className="flex items-center justify-between pl-4 pr-2 py-2 border-b border-[#222] flex-shrink-0">
                  <p className="font-semibold text-white">Eure Stimmen</p>
                  <button onClick={closeFunMode} aria-label="Schließen" className={`${iconBtn} text-ink-muted hover:text-white hover:bg-[#222]`}><X size={18} /></button>
                </div>
                <div className="overflow-y-auto flex-1 divide-y divide-[#1a1a1a]">
                  {byDate.map(({ dateStr, day, myNoms, partnerNoms, matchId, confirmed }) => (
                    <div key={dateStr} className="px-4 py-3">
                      <p className="text-sm text-ink-muted font-medium mb-2">{fmt(day, 'EEEE, d. MMMM')}</p>
                      {confirmed ? (
                        <div className="flex items-center gap-2 text-green-400 text-sm">
                          <span>✓</span>
                          <span className="font-medium">{mealName(confirmed)}</span>
                        </div>
                      ) : myNoms.length === 0 && partnerNoms.length === 0 ? (
                        <p className="text-sm text-ink-hint">Noch keine Stimmen für diesen Tag</p>
                      ) : matchId ? (
                        <div className="flex items-center gap-2 text-pink-400 text-sm">
                          <Heart size={12} className="fill-pink-400 flex-shrink-0" />
                          <span className="font-medium">{myNoms.find(n => n.recipe_id === matchId)?.recipe?.name}</span>
                          <span className="text-xs text-ink-muted">Match!</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-amber-300">Kein Match – wählt eins:</p>
                          {[...myNoms, ...partnerNoms.filter(n => !myNoms.find(m => m.recipe_id === n.recipe_id))].slice(0, 4).map(n => (
                            <button key={n.id} onClick={() => resolveConflict(dateStr, n.recipe_id)}
                              className="w-full min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-left transition-all">
                              <MealThumb recipe={n.recipe} size="w-8 h-8" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white font-medium truncate">{n.recipe?.name}</p>
                                <p className="text-xs text-ink-hint">
                                  {myNoms.find(m => m.recipe_id === n.recipe_id) ? 'deine Wahl' : `Wahl von ${partner}`}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 border-t border-[#1a1a1a] flex-shrink-0">
                  <button onClick={closeFunMode} className="w-full min-h-[44px] rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all">Fertig</button>
                </div>
              </div>
            </div>
          )
        }

        // Voting screen
        const currentDay = emptyDays[Math.min(funDayIndex, emptyDays.length - 1)]
        const dateStr = ds(currentDay)
        const cards = getCardsForDate(dateStr)
        const recipe = cards[funCardIndex]

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-[#141414] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl animate-slide-up pb-safe">
              <div className="flex items-center justify-between pl-4 pr-2 py-2 border-b border-[#222]">
                <div>
                  <p className="text-xs text-ink-muted font-medium">
                    Tag {funDayIndex + 1}/{emptyDays.length} · Karte {funCardIndex + 1}/{CARDS_PER_DAY}
                  </p>
                  <p className="text-sm font-semibold text-white">{fmt(currentDay, 'EEEE, d. MMMM')}</p>
                </div>
                <button onClick={closeFunMode} aria-label="Schließen" className={`${iconBtn} text-ink-muted hover:text-white hover:bg-[#222]`}>
                  <X size={18} />
                </button>
              </div>

              <div className="flex gap-1 px-4 pt-2">
                {cards.map((_, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-all ${
                    i < funCardIndex ? 'bg-primary' : i === funCardIndex ? 'bg-primary/50' : 'bg-[#2a2a2a]'
                  }`} />
                ))}
              </div>

              {recipe ? (
                <>
                  {recipe.image_url ? (
                    <div className="relative h-48 overflow-hidden mt-2">
                      <Image src={recipe.image_url} alt="" fill className="object-cover" unoptimized />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
                    </div>
                  ) : (
                    <div className="h-28 mt-2 bg-[#1a1a1a] flex items-center justify-center text-5xl">🍽️</div>
                  )}
                  <div className="px-4 py-3">
                    <p className="text-base font-semibold text-white leading-tight">{recipe.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-sm text-ink-muted">
                      {(recipe.prep_time || recipe.cook_time) ? <span>⏱ {(recipe.prep_time || 0) + (recipe.cook_time || 0)} Min.</span> : null}
                      {recipe.effort === 'quick' ? <span>⚡ schnell</span> : null}
                      {recipe.rating ? <StarRating rating={recipe.rating} size={12} /> : null}
                    </div>
                  </div>

                  <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                    <button onClick={() => funVote(recipe, false)}
                      className="min-h-[52px] flex items-center justify-center gap-2 rounded-xl bg-[#1c1c1c] hover:bg-red-500/10 border border-[#2a2a2a] hover:border-red-500/30 text-ink-soft hover:text-red-400 transition-all text-base font-medium">
                      <XCircle size={18} /> Nein
                    </button>
                    <button onClick={() => funVote(recipe, true)}
                      className="min-h-[52px] flex items-center justify-center gap-2 rounded-xl border bg-green-500/15 border-green-500/30 text-green-400 hover:bg-green-500/25 transition-all text-base font-medium">
                      <Heart size={18} /> Ja!
                    </button>
                  </div>
                </>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-ink-muted">Keine Rezepte vorhanden.</p>
              )}
            </div>
          </div>
        )
      })()}

      {/* Settle votes */}
      {settleDate && (() => {
        const dayNoms = nominations.filter(n => n.date === settleDate)
        const myNoms = dayNoms.filter(n => n.user_name === currentUser)
        const partnerNoms = dayNoms.filter(n => n.user_name !== currentUser)
        const partnerIds = new Set(partnerNoms.map(n => n.recipe_id))
        const matchNom = myNoms.find(n => partnerIds.has(n.recipe_id))
        // All unique picks, matches first
        const allPicks = [
          ...dayNoms.filter(n => partnerIds.has(n.recipe_id) && myNoms.find(m => m.recipe_id === n.recipe_id)).slice(0, 1),
          ...myNoms.filter(n => !partnerIds.has(n.recipe_id)),
          ...partnerNoms.filter(n => !myNoms.find(m => m.recipe_id === n.recipe_id)),
        ].filter((n, i, arr) => arr.findIndex(x => x.recipe_id === n.recipe_id) === i)
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setSettleDate(null) }}>
            <div className="w-full max-w-sm bg-[#141414] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl animate-slide-up pb-safe">
              <div className="flex items-center justify-between pl-4 pr-2 py-2 border-b border-[#222]">
                <div>
                  <p className="font-semibold text-white">
                    {matchNom ? '❤️ Ihr mögt beide' : '⚖️ Kein Match – wählt eins'}
                  </p>
                  <p className="text-sm text-ink-muted">{fmt(parseISO(settleDate), 'EEEE, d. MMMM')}</p>
                </div>
                <button onClick={() => setSettleDate(null)} aria-label="Schließen" className={`${iconBtn} text-ink-muted hover:text-white hover:bg-[#222]`}>
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 space-y-2">
                {allPicks.map(n => {
                  const isMine = !!myNoms.find(m => m.recipe_id === n.recipe_id)
                  const isMatch = isMine && partnerIds.has(n.recipe_id)
                  return (
                    <button key={n.recipe_id} onClick={() => resolveConflict(settleDate, n.recipe_id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                        isMatch
                          ? 'bg-pink-500/15 border-pink-500/30 hover:bg-pink-500/25'
                          : 'bg-[#1c1c1c] border-[#2a2a2a] hover:bg-[#252525]'
                      }`}>
                      <MealThumb recipe={n.recipe} size="w-10 h-10" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{n.recipe?.name}</p>
                        <p className="text-xs text-ink-hint">
                          {isMatch ? '❤️ ihr beide' : isMine ? 'deine Wahl' : `Wahl von ${partner}`}
                        </p>
                      </div>
                      {isMatch && <Heart size={14} className="text-pink-400 fill-pink-400 flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Swipen: day picker */}
      {funDayPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setFunDayPicker(false) }}>
          <div className="w-full max-w-sm bg-[#141414] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl animate-slide-up pb-safe">
            <div className="flex items-center justify-between pl-4 pr-2 py-2 border-b border-[#222]">
              <div>
                <p className="font-semibold text-white">Swipen</p>
                <p className="text-sm text-ink-muted">Für welche Abende?</p>
              </div>
              <button onClick={() => setFunDayPicker(false)} aria-label="Schließen"
                className={`${iconBtn} text-ink-muted hover:text-white hover:bg-[#222]`}>
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {days.map(day => {
                const s = ds(day)
                const hasEntry = !!entries.find(e => e.date === s)
                const isPast = s < todayStr
                const disabled = hasEntry || isPast
                const selected = funSelectedDates.has(s)
                return (
                  <button
                    key={s}
                    onClick={() => {
                      if (disabled) return
                      setFunSelectedDates(prev => {
                        const next = new Set(prev)
                        if (next.has(s)) next.delete(s)
                        else next.add(s)
                        return next
                      })
                    }}
                    disabled={disabled}
                    aria-pressed={selected}
                    className={`w-full min-h-[44px] flex items-center justify-between px-3 rounded-xl border transition-all ${
                      disabled
                        ? 'border-[#1e1e1e] bg-[#0f0f0f] opacity-40 cursor-not-allowed'
                        : selected
                          ? 'border-primary/50 bg-primary/10 text-white'
                          : 'border-[#2a2a2a] bg-[#1a1a1a] text-ink-soft hover:text-white hover:border-[#333]'
                    }`}
                  >
                    <span className="text-sm font-medium">{fmt(day, 'EEEE')}</span>
                    <span className="text-xs text-ink-muted">
                      {hasEntry ? 'schon geplant' : isPast ? 'vorbei' : fmt(day, 'd. MMM')}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="p-4 pt-0">
              <button
                onClick={startFunMode}
                disabled={funSelectedDates.size === 0}
                className="w-full min-h-[48px] rounded-xl bg-primary hover:bg-primary-hover text-white text-base font-semibold transition-all disabled:opacity-40"
              >
                Los geht&apos;s – {abende(funSelectedDates.size)} 🎲
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        // Centred by a full-width wrapper: the slide-up animation sets `transform`,
        // which would otherwise cancel a translate-based centring.
        <div className="fixed inset-x-0 bottom-24 md:bottom-6 md:left-56 z-[60] flex justify-center px-4 pointer-events-none">
          <div role="status" className="pointer-events-auto flex items-center gap-2 pl-4 pr-1.5 min-h-[44px] max-w-full bg-[#1e1e1e] border border-[#333] rounded-full text-sm text-white shadow-xl animate-slide-up whitespace-nowrap">
            <span className={`truncate ${toast.action ? '' : 'pr-2.5'}`}>{toast.msg}</span>
            {toast.action && (
              <button onClick={toast.action.onClick}
                className="min-h-[40px] px-3 rounded-full text-primary font-semibold hover:bg-white/5 transition-colors flex-shrink-0">
                {toast.action.label}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
