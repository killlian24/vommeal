'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addDays, subDays, isToday, isTomorrow, isYesterday } from 'date-fns'
import { de } from 'date-fns/locale'
import Image from 'next/image'
import Link from 'next/link'
import { ShoppingCart, Clock, ChevronRight, BookOpen, Shuffle, Zap, ChefHat, ThumbsDown } from 'lucide-react'
import { StarRating } from '@/components/StarRating'
import { QUICK_MEALS, quickMealEmoji } from '@/lib/quickMeals'
import { track } from '@/lib/track'

type Effort = 'quick' | 'involved' | null
type Recipe = {
  id: string; name: string; image_url: string; prep_time: number; cook_time: number
  rating: number | null; effort?: Effort
}
type MealEntry = {
  id: string; date: string; recipe_id: string | null; custom_meal_name: string | null
  servings: number; recipe?: Recipe
}

const ISO = 'yyyy-MM-dd'
const HISTORY_DAYS = 30
const RECENT_DAYS = 21
const RATE_WINDOW_DAYS = 2
const PROMPTED_KEY = (entryId: string) => `vommeal_rate_prompted_${entryId}`

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  if (isToday(d)) return 'Heute'
  if (isTomorrow(d)) return 'Morgen'
  if (isYesterday(d)) return 'Gestern'
  return format(d, 'EEEE', { locale: de })
}

function wasPrompted(entryId: string): boolean {
  try { return localStorage.getItem(PROMPTED_KEY(entryId)) === '1' } catch { return false }
}

function markPrompted(entryId: string) {
  try { localStorage.setItem(PROMPTED_KEY(entryId), '1') } catch { /* storage unavailable */ }
}

// Rating ≥ 4 first, then unrated, then the middling ones. Rating 1 never gets here.
function ratingScore(rating: number | null): number {
  if (rating == null) return 2
  if (rating >= 4) return 3
  return 1
}

/**
 * Picks `count` recipes to cook today.
 * - never rating 1 ("nicht nochmal")
 * - nothing cooked in the last 21 days or already planned for the next days
 * - prefers rating ≥ 4, then unrated; Mon–Thu prefers quick recipes
 * - slight randomness; `exclude` skips what was just shown (for "Andere Vorschläge")
 */
function pickSuggestions(recipes: Recipe[], entries: MealEntry[], exclude: Set<string>, count = 3): Recipe[] {
  const now = new Date()
  const today = format(now, ISO)
  const recentStart = format(subDays(now, RECENT_DAYS), ISO)
  const weekday = now.getDay() // 0 = Sonntag
  const preferQuick = weekday >= 1 && weekday <= 4

  const lastCooked = new Map<string, string>()
  const planned = new Set<string>()
  for (const e of entries) {
    if (!e.recipe_id) continue
    if (e.date >= today) { planned.add(e.recipe_id); continue }
    const prev = lastCooked.get(e.recipe_id)
    if (!prev || e.date > prev) lastCooked.set(e.recipe_id, e.date)
  }

  const allowed = recipes.filter(r => r.rating !== 1 && !planned.has(r.id))
  const fresh = allowed.filter(r => (lastCooked.get(r.id) ?? '') < recentStart)

  const score = (r: Recipe) => {
    let s = ratingScore(r.rating) + Math.random() * 1.2
    if (preferQuick) {
      if (r.effort === 'quick') s += 1.5
      else if (r.effort === 'involved') s -= 1
    }
    return s
  }

  let pool = fresh.filter(r => !exclude.has(r.id))
  if (pool.length < count) pool = fresh // shuffled through everything: start over
  const picked = pool
    .map(r => ({ r, s: score(r) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, count)
    .map(x => x.r)

  // Small collection: top up with the recipes cooked longest ago.
  if (picked.length < count) {
    const ids = new Set(picked.map(r => r.id))
    const rest = allowed
      .filter(r => !ids.has(r.id))
      .sort((a, b) => (lastCooked.get(a.id) ?? '').localeCompare(lastCooked.get(b.id) ?? ''))
    picked.push(...rest.slice(0, count - picked.length))
  }
  return picked
}

// Mealie offline or image gone: show the card background instead of a broken-image glyph.
const hideBrokenImage = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.visibility = 'hidden' }

function EffortBadge({ effort }: { effort?: Effort }) {
  if (effort === 'quick') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
        <Zap size={11} /> Schnell
      </span>
    )
  }
  if (effort === 'involved') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <ChefHat size={11} /> Aufwändig
      </span>
    )
  }
  return null
}

export default function TonightPage() {
  const [entries, setEntries] = useState<MealEntry[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [currentUser, setCurrentUser] = useState('')
  const [addingDate, setAddingDate] = useState<string | null>(null)
  const [planning, setPlanning] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Recipe[]>([])
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const [ratePrompt, setRatePrompt] = useState<MealEntry | null>(null)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const loadEntries = useCallback(async (): Promise<MealEntry[]> => {
    const now = new Date()
    const start = format(subDays(now, HISTORY_DAYS), ISO)
    const end = format(addDays(now, 3), ISO)
    const res = await fetch(`/api/meal-plan?start=${start}&end=${end}`)
    if (!res.ok) throw new Error('meal-plan')
    const data: MealEntry[] = await res.json()
    setEntries(data)
    return data
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [entryData, recipeRes, settingsRes] = await Promise.all([
          loadEntries(),
          fetch('/api/recipes'),
          fetch('/api/settings'),
        ])
        if (!recipeRes.ok) throw new Error('recipes')
        const recipeData: Recipe[] = await recipeRes.json()
        const settings = settingsRes.ok ? await settingsRes.json() : {}
        if (cancelled) return

        let user = ''
        try { user = localStorage.getItem('vommeal_user') || '' } catch { /* storage unavailable */ }
        setCurrentUser(user || settings.user1_name || settings.user2_name || '')

        setRecipes(recipeData)
        const first = pickSuggestions(recipeData, entryData, new Set())
        setSuggestions(first)
        setSeen(new Set(first.map(r => r.id)))

        // "Wie war's?": most recent recipe meal of the last two days not yet asked about.
        const today = format(new Date(), ISO)
        const windowStart = format(subDays(new Date(), RATE_WINDOW_DAYS), ISO)
        const candidate = entryData
          .filter(e => e.recipe_id && e.date < today && e.date >= windowStart && !wasPrompted(e.id))
          .sort((a, b) => b.date.localeCompare(a.date))[0]
        setRatePrompt(candidate ?? null)
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [loadEntries])

  const recipeById = new Map(recipes.map(r => [r.id, r]))
  const fullRecipe = (e: MealEntry): Recipe | undefined =>
    (e.recipe_id && recipeById.get(e.recipe_id)) || e.recipe

  const addToList = async (date: string) => {
    setAddingDate(date)
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_date', date }),
      })
      const data = await res.json()
      if (data.added > 0) showToast(`${data.added} Zutaten auf die Einkaufsliste gesetzt`)
      else showToast('Schon auf der Liste oder keine Zutaten hinterlegt')
    } catch {
      showToast('Einkaufsliste nicht erreichbar')
    }
    setAddingDate(null)
  }

  const planToday = async (payload: { recipe_id: string } | { custom_meal_name: string }, key: string) => {
    setPlanning(key)
    try {
      const res = await fetch('/api/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: format(new Date(), ISO),
          meal_type: 'dinner',
          servings: 2,
          suggested_by: currentUser,
          ...payload,
        }),
      })
      if (!res.ok) throw new Error()
      await loadEntries()
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return true
    } catch {
      showToast('Konnte nicht gespeichert werden')
      return false
    } finally {
      setPlanning(null)
    }
  }

  const cookSuggestion = async (recipe: Recipe, rank: number) => {
    if (await planToday({ recipe_id: recipe.id }, recipe.id)) {
      track('tonight_suggest_pick', { recipe_id: recipe.id, rank, rating: recipe.rating, effort: recipe.effort ?? null })
    }
  }

  const planQuick = async (name: string) => {
    if (await planToday({ custom_meal_name: name }, name)) track('tonight_quick', { name })
  }

  const shuffle = () => {
    const next = pickSuggestions(recipes, entries, seen)
    setSuggestions(next)
    setSeen(prev => {
      const merged = new Set(prev)
      // Pool exhausted and restarted: begin a new round of "seen".
      if (next.some(r => prev.has(r.id))) merged.clear()
      next.forEach(r => merged.add(r.id))
      return merged
    })
  }

  const rate = async (entry: MealEntry, choice: 'stars' | 'never' | 'skip', stars?: number) => {
    markPrompted(entry.id)
    setRatePrompt(null)
    if (choice === 'skip') {
      track('rating_prompt', { choice: 'skip' })
      return
    }
    const rating = choice === 'never' ? 1 : stars!
    track('rating_prompt', { choice, stars: rating, recipe_id: entry.recipe_id })
    showToast(choice === 'never' ? 'Alles klar, kommt nicht mehr vor' : 'Danke fürs Bewerten!')
    setRecipes(rs => rs.map(r => (r.id === entry.recipe_id ? { ...r, rating } : r)))
    try {
      await fetch(`/api/recipes/${entry.recipe_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      })
    } catch { /* the local rating is best effort; the prompt will not reappear */ }
  }

  const today = format(new Date(), ISO)
  const todayEntry = entries.find(e => e.date === today)
  const upcomingEntries = entries.filter(e => e.date > today)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-40" />
        <div className="skeleton h-64 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
    )
  }

  const todayRecipe = todayEntry ? fullRecipe(todayEntry) : undefined
  const todayEmoji = todayEntry && !todayEntry.recipe_id ? (quickMealEmoji(todayEntry.custom_meal_name) ?? '🍽️') : null
  const rateRecipe = ratePrompt ? fullRecipe(ratePrompt) : undefined

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Heute</h1>
          <p className="text-sm text-ink-muted mt-0.5">{format(new Date(), 'EEEE, d. MMMM', { locale: de })}</p>
        </div>
        <Link href="/" className="flex items-center gap-1 text-sm text-ink-muted hover:text-white transition-colors mt-1.5 py-1">
          Woche <ChevronRight size={14} />
        </Link>
      </div>

      {loadError && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          Vommeal konnte nicht geladen werden. Prüfe die Verbindung und lade die Seite neu.
        </p>
      )}

      {/* Wie war's? */}
      {ratePrompt && (
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4 animate-slide-up">
          <div className="flex items-center gap-3 mb-3">
            {rateRecipe?.image_url && (
              <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0">
                <Image src={rateRecipe.image_url} alt="" fill className="object-cover" unoptimized onError={hideBrokenImage} />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-base font-semibold text-white">Wie war's?</p>
              <p className="text-sm text-ink-muted truncate">
                {dayLabel(ratePrompt.date)}: {rateRecipe?.name ?? 'Rezept'}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-1 mb-3" role="group" aria-label="Sterne vergeben">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => rate(ratePrompt, 'stars', n)}
                aria-label={`${n} ${n === 1 ? 'Stern' : 'Sterne'}`}
                className="flex-1 flex items-center justify-center h-12 rounded-xl bg-[#1c1c1c] active:bg-primary/20 active:scale-95 transition-all"
              >
                <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span className="sr-only">{n}</span>
                <span aria-hidden className="ml-1 text-xs text-ink-muted tabular-nums">{n}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => rate(ratePrompt, 'never')}
              className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl border border-red-500/25 bg-red-500/10 text-red-300 text-sm font-medium active:scale-[0.98] transition-all"
            >
              <ThumbsDown size={15} /> Nicht nochmal
            </button>
            <button
              type="button"
              onClick={() => rate(ratePrompt, 'skip')}
              className="flex-1 h-11 rounded-xl border border-[#2a2a2a] text-ink-muted text-sm font-medium active:scale-[0.98] transition-all"
            >
              Überspringen
            </button>
          </div>
        </div>
      )}

      {/* Heute — big card */}
      {todayEntry ? (
        <div className="relative rounded-2xl border border-primary/30 overflow-hidden bg-[#141414]">
          {todayRecipe?.image_url ? (
            <div className="relative h-52 overflow-hidden">
              <Image src={todayRecipe.image_url} alt="" fill className="object-cover" unoptimized onError={hideBrokenImage} />
              <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/40 to-transparent" />
            </div>
          ) : todayEmoji ? (
            <div className="pt-8 text-center text-6xl" aria-hidden>{todayEmoji}</div>
          ) : null}
          <div className={`p-5 ${todayRecipe?.image_url ? '-mt-16 relative' : ''} ${todayEmoji ? 'text-center' : ''}`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Heute Abend</p>
            <p className="text-2xl font-bold text-white leading-tight mb-2">
              {todayEntry.recipe_id ? todayRecipe?.name : todayEntry.custom_meal_name}
            </p>
            {todayRecipe && (todayRecipe.rating || todayRecipe.effort || todayRecipe.prep_time) ? (
              <div className="flex flex-wrap items-center gap-3 mb-4 text-sm text-ink-muted">
                {todayRecipe.rating ? <StarRating rating={todayRecipe.rating} size={16} /> : null}
                <EffortBadge effort={todayRecipe.effort} />
                {todayRecipe.prep_time ? (
                  <span className="flex items-center gap-1.5">
                    <Clock size={13} />
                    {todayRecipe.prep_time + (todayRecipe.cook_time || 0)} Min.
                  </span>
                ) : null}
              </div>
            ) : null}
            {todayEntry.recipe_id && (
              <div className="flex flex-col gap-2 mt-4">
                <Link
                  href={`/recipes/${todayEntry.recipe_id}`}
                  className="flex items-center justify-center gap-2 h-12 rounded-xl bg-primary hover:bg-primary-hover text-white text-base font-semibold transition-all active:scale-[0.98]"
                >
                  <BookOpen size={18} /> Rezept öffnen
                </Link>
                <button
                  onClick={() => addToList(today)}
                  disabled={addingDate === today}
                  className="flex items-center justify-center gap-2 h-11 rounded-xl border border-[#2a2a2a] bg-[#1c1c1c] text-ink-soft text-sm font-medium transition-all disabled:opacity-50 active:scale-[0.98]"
                >
                  <ShoppingCart size={15} />
                  {addingDate === today ? 'Wird hinzugefügt…' : 'Zutaten auf die Einkaufsliste'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-lg font-semibold text-white">Noch nichts geplant</p>
            <p className="text-sm text-ink-muted">Wie wär's mit einem davon?</p>
          </div>

          {suggestions.length === 0 ? (
            <div className="rounded-2xl border border-[#1e1e1e] bg-[#141414] p-6 text-center text-sm text-ink-muted">
              Noch keine Rezepte da.{' '}
              <Link href="/recipes" className="text-primary">Rezepte hinzufügen</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((r, i) => (
                <div key={r.id} className="flex items-stretch bg-[#141414] border border-[#1e1e1e] rounded-2xl overflow-hidden animate-slide-up">
                  <Link href={`/recipes/${r.id}`} className="relative w-24 flex-shrink-0 bg-[#1c1c1c]">
                    {r.image_url ? (
                      <Image src={r.image_url} alt="" fill className="object-cover" unoptimized onError={hideBrokenImage} />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-3xl">🍽️</span>
                    )}
                  </Link>
                  <div className="flex-1 min-w-0 p-3 flex flex-col justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/recipes/${r.id}`} className="text-base font-semibold text-white leading-snug line-clamp-2">
                        {r.name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {r.rating ? <StarRating rating={r.rating} size={12} /> : null}
                        <EffortBadge effort={r.effort} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => cookSuggestion(r, i)}
                      disabled={planning !== null}
                      className="self-start flex items-center gap-1.5 px-4 h-10 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-all disabled:opacity-50 active:scale-95"
                    >
                      {planning === r.id ? 'Wird geplant…' : 'Heute kochen'}
                    </button>
                  </div>
                </div>
              ))}
              {recipes.length > 3 && (
                <button
                  type="button"
                  onClick={shuffle}
                  className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-[#2a2a2a] bg-[#1c1c1c] text-sm font-medium text-ink-soft active:scale-[0.98] transition-all"
                >
                  <Shuffle size={15} /> Andere Vorschläge
                </button>
              )}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-hint mb-2">Oder heute ohne Kochen</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_MEALS.map(q => (
                <button
                  key={q.name}
                  type="button"
                  onClick={() => planQuick(q.name)}
                  disabled={planning !== null}
                  className="flex items-center gap-2 h-12 px-3 rounded-xl border border-[#2a2a2a] bg-[#141414] text-sm font-medium text-ink-soft transition-all disabled:opacity-50 active:scale-95"
                >
                  <span className="text-lg" aria-hidden>{q.emoji}</span>
                  {planning === q.name ? 'Wird geplant…' : q.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Upcoming — compact cards */}
      {upcomingEntries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-hint">Als Nächstes</p>
          {upcomingEntries.map(entry => {
            const r = fullRecipe(entry)
            const emoji = entry.recipe_id ? null : quickMealEmoji(entry.custom_meal_name)
            return (
              <div key={entry.id} className="flex items-center gap-3 bg-[#141414] border border-[#1e1e1e] rounded-xl px-4 py-3">
                {r?.image_url ? (
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                    <Image src={r.image_url} alt="" fill className="object-cover" unoptimized onError={hideBrokenImage} />
                  </div>
                ) : emoji ? (
                  <div className="w-12 h-12 rounded-lg bg-[#1c1c1c] flex items-center justify-center text-2xl flex-shrink-0" aria-hidden>{emoji}</div>
                ) : null}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-ink-muted font-medium">{dayLabel(entry.date)}</p>
                  {entry.recipe_id ? (
                    <Link href={`/recipes/${entry.recipe_id}`}
                      className="text-sm font-semibold text-white hover:text-primary transition-colors truncate block">
                      {r?.name}
                    </Link>
                  ) : (
                    <p className="text-sm font-semibold text-white truncate">{entry.custom_meal_name}</p>
                  )}
                </div>
                {entry.recipe_id && (
                  <button
                    onClick={() => addToList(entry.date)}
                    disabled={addingDate === entry.date}
                    aria-label="Zutaten auf die Einkaufsliste"
                    className="p-2.5 rounded-lg text-ink-hint hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-50 flex-shrink-0"
                  >
                    <ShoppingCart size={17} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div role="status" className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-[#1e1e1e] border border-[#333] rounded-full text-sm text-white shadow-xl animate-slide-up whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}
