'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, CircleCheck, RefreshCw, Send } from 'lucide-react'
import { Sheet, SheetTitle, SheetClose } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { track } from '@/lib/track'
import { dayLabel, todayIso } from '@/lib/dates'
import { runHaSync, type SyncResult } from '@/lib/haSync'
import { CATEGORY_LABELS, CATEGORIES, DEFAULT_CATEGORY_ORDER, plural } from '@/lib/shoppingLabels'
import {
  type Selection, initialSelection, isSelected, toggleItem, setMealOn, setAllMealsOn,
  activeMealIds, isHidden, mealCounts, buildCommitLines,
} from '@/lib/shoppingSelection'

// "Zutaten der Woche": the one way from planned meals to the shopping list.
// Opened from Einkauf (today to the end of next week), from Woche
// ("Einkaufen", the week on screen), from a card's cart and from Heute (one
// evening). Meals are switches, ingredients can be deselected, nothing is
// written before "N auf die Liste".

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
  /** Already shopped for: starts off and sits under „Schon eingekauft“. */
  added: boolean
  /** Hardly any ingredients in Mealie. */
  thin: boolean
}

type Review = {
  phase: 'loading' | 'select' | 'saving' | 'added' | 'sending' | 'sent'
  items: ReviewItem[]
  meals: ReviewMeal[]
  haConfigured: boolean
  start: string
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

const STATUS_ORDER: Record<ReviewItem['status'], number> = { new: 0, staple: 1, on_list: 2 }

/** "Mo 29.9. Linsen · Mi 1.10. Tajine": meals with their day. */
function datedMealsLabel(meals: ReviewItem['meals'], today: string): string {
  return [...meals]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(m => `${dayLabel(m.date, today)} ${m.recipe_name}`)
    .join(' · ')
}

/** "heute", "morgen" or "Mi 30.9." inside a sentence. */
const inSentence = (date: string, today: string) => {
  const d = dayLabel(date, today)
  return d === 'Heute' || d === 'Morgen' ? d.toLowerCase() : d
}

export function WeekIngredientsSheet({ start, end, source, categoryOrder: givenOrder, onClose, onChanged, onPantryAdd, onSynced }: {
  /** First evening (days before today are left out by the server) */
  start: string
  /** Last evening */
  end: string
  /** Where it was opened, for the usage log */
  source: 'shopping' | 'week' | 'card' | 'tonight'
  /** Store order; loaded from the settings when not given */
  categoryOrder?: string[]
  onClose: () => void
  /** Something was put on the list (reload it) */
  onChanged?: () => void
  /** An ingredient went into the pantry */
  onPantryAdd?: (staple: { id: string; name: string }) => void
  /** Abgleichen ran (Einkauf shows the result) */
  onSynced?: (result: SyncResult) => void
}) {
  const { show: showToast, error: showError } = useToast()
  const today = todayIso()
  const [review, setReview] = useState<Review>({ phase: 'loading', items: [], meals: [], haConfigured: false, start, end, markedBought: [] })
  const [sel, setSel] = useState<Selection>(() => initialSelection([]))
  const [stapleBusy, setStapleBusy] = useState<string | null>(null)
  const [markBusy, setMarkBusy] = useState<string | null>(null)
  // Meals switched off in this sheet: they offer "Als schon eingekauft merken?"
  const [switchedOff, setSwitchedOff] = useState<Set<string>>(new Set())
  const [loadedOrder, setLoadedOrder] = useState<string[] | null>(null)
  const categoryOrder = givenOrder ?? loadedOrder ?? DEFAULT_CATEGORY_ORDER

  useEffect(() => {
    if (givenOrder) return
    fetch('/api/settings').then(r => r.json()).then(s => {
      if (s.category_order) {
        try { setLoadedOrder(JSON.parse(s.category_order)) } catch { /* default order */ }
      }
    }).catch(() => { /* default order */ })
  }, [givenOrder])

  const load = async () => {
    setReview(r => ({ ...r, phase: 'loading', error: undefined }))
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', start, end }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || 'preview failed')
      const reviewMeals: ReviewMeal[] = Array.isArray(data.meals) ? data.meals : []
      setSel(initialSelection(reviewMeals))
      setReview({
        phase: 'select',
        items: data.items ?? [],
        meals: reviewMeals,
        haConfigured: !!data.ha_configured,
        start: data.start ?? start,
        end: data.end ?? end,
        markedBought: [],
      })
    } catch {
      setReview(r => ({ ...r, phase: 'select', error: 'Zutaten konnten nicht geladen werden. Bitte nochmal versuchen.' }))
    }
  }

  useEffect(() => {
    track('shopping_review_open', { source })
    load()
    // Opens once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const busy = review.phase === 'saving' || review.phase === 'sending'
  const close = () => { if (!busy) onClose() }

  const toggleMeal = (meal: ReviewMeal) => {
    const on = !sel.on.has(meal.meal_plan_id)
    track('shopping_meal_toggle', { on })
    setSel(prev => setMealOn(meal.meal_plan_id, on, review.items, prev))
    setSwitchedOff(prev => {
      const next = new Set(prev)
      if (on || meal.added) next.delete(meal.meal_plan_id)
      else next.add(meal.meal_plan_id)
      return next
    })
  }

  /** Record a meal as „schon eingekauft“ (it moves down and stays off next time). */
  const markMealBought = async (meal: ReviewMeal) => {
    if (markBusy) return
    const id = meal.meal_plan_id
    const before = { review, sel }
    track('shopping_meal_mark_bought')
    setMarkBusy(id)
    setSel(prev => setMealOn(id, false, review.items, prev))
    setSwitchedOff(prev => { const next = new Set(prev); next.delete(id); return next })
    setReview(r => ({
      ...r,
      meals: r.meals.map(m => m.meal_plan_id === id ? { ...m, added: true } : m),
      markedBought: [...r.markedBought.filter(x => x !== id), id],
    }))
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_meals', meal_plan_ids: [id], added: true }),
      })
      if (!res.ok) throw new Error('mark_meals failed')
    } catch {
      setSel(before.sel)
      setReview(r => ({ ...r, meals: before.review.meals, markedBought: before.review.markedBought }))
      showError('Konnte nicht gespeichert werden')
    } finally {
      setMarkBusy(null)
    }
  }

  const showAllMeals = () => {
    setSel(prev => setAllMealsOn(review.meals.map(m => m.meal_plan_id), prev))
    setReview(r => ({ ...r, showAll: true }))
  }

  const addToPantry = async (item: ReviewItem) => {
    setStapleBusy(item.key)
    try {
      const res = await fetch('/api/pantry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: item.name }),
      })
      const staple = await res.json().catch(() => ({}))
      if (!res.ok || !staple?.id) throw new Error('pantry add failed')
      onPantryAdd?.(staple)
      track('pantry_add', { from: 'review' })
      setSel(prev => {
        const overrides = new Map(prev.overrides)
        overrides.delete(item.key)
        return { on: prev.on, overrides }
      })
      setReview(r => ({ ...r, items: r.items.map(i => i.key === item.key ? { ...i, status: 'staple' } : i) }))
      showToast(`Jetzt im Vorrat: ${item.name}`)
    } catch {
      showError('Konnte nicht zum Vorrat hinzugefügt werden')
    } finally {
      setStapleBusy(null)
    }
  }

  const commit = async () => {
    // Items already on the list are sent too (for meals that are on), so their row learns the
    // new meals. Each line only names the meals it is currently for.
    const mealNames = new Map(review.meals.map(m => [m.meal_plan_id, m.name]))
    const { chosen, lines: payload } = buildCommitLines(review.items, sel, mealNames)
    if (chosen.length === 0) {
      // Nothing to add, but meals were marked „schon eingekauft“: that is already saved.
      if (review.markedBought.length > 0) onClose()
      return
    }
    setReview(r => ({ ...r, phase: 'saving', error: undefined }))
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_selected', items: payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || 'add_selected failed')
      track('shopping_add', { count: chosen.length, source })
      onChanged?.()
      const haConfigured = data.ha_configured ?? review.haConfigured
      if (haConfigured) {
        setReview(r => ({ ...r, phase: 'added', added: chosen.length, merged: data.merged ?? 0, haConfigured }))
      } else {
        onClose()
        showToast(`${plural(chosen.length, 'Zutat', 'Zutaten')} auf der Liste`)
      }
    } catch {
      setReview(r => ({ ...r, phase: 'select', error: 'Hinzufügen hat nicht geklappt. Bitte nochmal versuchen.' }))
    }
  }

  const sync = async () => {
    track('shopping_send_keep')
    setReview(r => ({ ...r, phase: 'sending' }))
    const result = await runHaSync()
    if (result.ok) onChanged?.()
    onSynced?.(result.ok ? (result.data ?? { ok: true }) : { ok: false, error: result.msg })
    setReview(r => ({
      ...r,
      phase: 'sent',
      sendResult: result.ok
        ? { ok: true, msg: (result.data?.pushed ?? 0) > 0 ? `${plural(result.data?.pushed ?? 0, 'Eintrag', 'Einträge')} an Home Assistant gesendet.` : 'Home Assistant war schon aktuell.' }
        : { ok: false, msg: result.msg },
    }))
  }

  const reviewGroups = useMemo(() => {
    const bought = new Set(review.meals.filter(m => m.added).map(m => m.meal_plan_id))
    const visible = review.items.filter(i => !isHidden(i, sel, bought))
    const order = Array.from(new Set([...categoryOrder, ...DEFAULT_CATEGORY_ORDER]))
    return order
      .map(cat => ({
        cat,
        items: visible
          .filter(i => (CATEGORIES.includes(i.category) ? i.category : 'other') === cat)
          .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name, 'de')),
      }))
      .filter(g => g.items.length > 0)
  }, [review, sel, categoryOrder])

  const selectedCount = review.items.filter(i => isSelected(i, sel)).length
  const openMeals = review.meals.filter(m => !m.added)
  const boughtMeals = review.meals.filter(m => m.added)
  /** Every planned meal is already shopped for and none was switched back on. */
  const allBought = review.meals.length > 0 && openMeals.length === 0
    && !review.showAll && review.meals.every(m => !sel.on.has(m.meal_plan_id))
  const canFinish = selectedCount === 0 && review.markedBought.length > 0

  const oneDay = start === end
  const title = oneDay ? `Zutaten für ${inSentence(start, today)}` : 'Zutaten der Woche'
  const rangeStart = review.start < today ? today : review.start
  const subtitle = oneDay ? '' : `${dayLabel(rangeStart, today)} bis ${dayLabel(review.end, today)}`

  /** One row in the „Mahlzeiten“ block: the switch, and after switching off the offer to remember it. */
  const renderMealRow = (meal: ReviewMeal) => {
    const on = sel.on.has(meal.meal_plan_id)
    const { selected: nSel, total } = mealCounts(meal.meal_plan_id, review.items, sel)
    const rowBusy = review.phase === 'saving' || markBusy === meal.meal_plan_id
    const detail = meal.added && !on
      ? 'Einschalten, um nochmal einzukaufen'
      : total === 0 ? 'Keine Zutaten hinterlegt' : `${nSel} von ${total} Zutaten`
    return (
      <div key={meal.meal_plan_id}>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => toggleMeal(meal)}
          disabled={rowBusy}
          className="w-full min-h-[56px] flex items-center gap-3 px-3 py-2 text-left rounded-xl hover:bg-[#1c1c1c] disabled:opacity-60"
        >
          <span className={`relative flex-shrink-0 inline-block h-6 w-10 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-[#3a3a3a]'}`}>
            <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
          </span>
          <span className="flex-1 min-w-0">
            <span className={`block text-[15px] leading-snug line-clamp-2 ${on ? 'text-white' : 'text-[#b5b5b5]'}`}>
              <span className={on ? 'text-[#d0d0d0]' : 'text-[#9a9a9a]'}>{dayLabel(meal.date, today)}</span>
              <span className="text-[#7a7a7a]"> · </span>
              {meal.name}
            </span>
            <span className="block text-[13px] leading-snug text-[#9a9a9a]">
              {detail}
              {meal.thin && total > 0 && <span className="text-amber-200/90"> · kaum Zutaten in Mealie</span>}
            </span>
          </span>
        </button>
        {switchedOff.has(meal.meal_plan_id) && !on && !meal.added && (
          <div className="flex items-center gap-2 pl-[3.75rem] pr-2 pb-2 -mt-1">
            <span className="flex-1 min-w-0 text-[13px] text-[#9a9a9a]">Als schon eingekauft merken?</span>
            <button
              type="button"
              onClick={() => markMealBought(meal)}
              disabled={rowBusy}
              className="flex-shrink-0 min-h-[44px] px-3 rounded-lg text-sm font-medium text-primary hover:bg-[#1c1c1c] disabled:opacity-50"
            >
              Merken
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    // Cannot be closed while adding or sending
    <Sheet
      onClose={close}
      dismissible={!busy}
      centerFrom="md"
      className="[--sheet-max:88dvh] w-full md:max-w-lg flex flex-col bg-[#121212] border-t md:border border-[#2a2a2a] rounded-t-2xl md:rounded-2xl shadow-2xl"
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 border-b border-[#222] flex-shrink-0">
        <div className="min-w-0">
          <SheetTitle className="text-lg font-bold text-white">{title}</SheetTitle>
          <p className="text-sm text-[#9a9a9a]">
            {subtitle}
            {review.phase === 'select' && review.items.length > 0 && !allBought && `${subtitle ? ' · ' : ''}Abwählen, was ihr habt`}
          </p>
        </div>
        <SheetClose disabled={busy} size={20} className="-mr-2 -mt-1" />
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {review.phase === 'loading' && (
          <div className="space-y-2 p-2">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
          </div>
        )}

        {review.error && (
          <div className="m-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {review.error}
            <button type="button" onClick={load} className="block mt-1 min-h-[40px] font-semibold text-red-200 underline underline-offset-2">
              Nochmal versuchen
            </button>
          </div>
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
              <p className="text-[#e5e5e5]">
                {oneDay ? 'Dafür ist schon eingekauft' : 'Alles für die geplanten Mahlzeiten ist schon eingekauft'}
              </p>
              {!oneDay && <p className="text-sm text-[#9a9a9a] mt-1">Neu geplante Gerichte tauchen hier auf.</p>}
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
                    {openMeals.map(renderMealRow)}
                  </div>
                )}
                {boughtMeals.length > 0 && (
                  <>
                    <p className="pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-[#9a9a9a]">Schon eingekauft</p>
                    <div className="rounded-xl border border-[#222] bg-[#141414] divide-y divide-[#202020]">
                      {boughtMeals.map(renderMealRow)}
                    </div>
                  </>
                )}
              </section>

              <h3 className="px-2 pt-1 text-sm font-semibold text-white">Zutaten</h3>
              {reviewGroups.length === 0 ? (
                <p className="px-2 py-4 text-sm text-[#9a9a9a]">
                  {review.items.length === 0
                    ? 'Für diese Gerichte sind keine Zutaten hinterlegt.'
                    : sel.on.size > 0
                      ? 'Für die eingeschalteten Gerichte ist nichts mehr einzukaufen.'
                      : 'Keine Mahlzeit eingeschaltet. Schalte oben ein Gericht ein.'}
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
                            onClick={() => !isOnList && setSel(prev => toggleItem(item, prev))}
                            disabled={isOnList || review.phase === 'saving'}
                            aria-pressed={isOnList ? undefined : itemSelected}
                            className="flex-1 min-w-0 min-h-[52px] flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-[#1a1a1a] disabled:hover:bg-transparent"
                          >
                            <span className={`w-[22px] h-[22px] flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${
                              itemSelected ? 'bg-primary border-primary' : isOnList ? 'border-[#3a3a3a] bg-[#262626]' : 'border-[#6b6b6b]'
                            }`}>
                              {itemSelected && <Check size={13} className="text-white" strokeWidth={3} />}
                              {isOnList && <Check size={13} className="text-[#8a8a8a]" strokeWidth={3} />}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className={`block text-[15px] leading-snug ${itemSelected ? 'text-white' : 'text-[#9a9a9a]'}`}>
                                {item.name}
                              </span>
                              <span className="block text-[13px] leading-snug text-[#8a8a8a] line-clamp-2">
                                {datedMealsLabel(item.meals.filter(m => forMeals.includes(m.meal_plan_id)), today)}
                              </span>
                            </span>
                            {tag && (
                              <span className="flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-[#222] border border-[#333] text-[#a5a5a5]">
                                {tag}
                              </span>
                            )}
                          </button>
                          {/* Only for what was just deselected: "we have it" can become "we always have it" */}
                          {item.status === 'new' && !itemSelected && (
                            <button
                              type="button"
                              onClick={() => addToPantry(item)}
                              disabled={stapleBusy === item.key || review.phase === 'saving'}
                              title="Zum Vorrat hinzufügen, wird künftig nicht mehr vorausgewählt"
                              className="flex-shrink-0 min-h-[44px] px-2 rounded-lg text-xs text-[#9a9a9a] underline decoration-[#444] underline-offset-2 hover:text-white hover:bg-[#1a1a1a] disabled:opacity-50"
                            >
                              In den Vorrat
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
              <p className="text-sm text-[#9a9a9a]">Jetzt abgleichen, damit sie auch in eurer Home-Assistant-Liste stehen.</p>
            )}
            {review.sendResult && (
              <p className={`text-sm ${review.sendResult.ok ? 'text-[#9fb8a1]' : 'text-red-300'}`}>
                {review.sendResult.msg}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="px-4 pt-3 border-t border-[#222] pb-[max(1rem,env(safe-area-inset-bottom))]">
        {(review.phase === 'select' || review.phase === 'saving' || review.phase === 'loading') && (
          review.phase !== 'loading' && (review.meals.length === 0 || allBought || canFinish || !!review.error) ? (
            <button
              onClick={close}
              className={canFinish || (allBought && review.markedBought.length > 0)
                ? 'w-full min-h-[48px] rounded-xl bg-primary-solid hover:bg-primary-solidHover text-white text-base font-semibold transition-colors'
                : 'w-full min-h-[48px] rounded-xl bg-[#1c1c1c] border border-[#2a2a2a] text-[#e5e5e5] text-base font-medium'}
            >
              {canFinish || (allBought && review.markedBought.length > 0) ? 'Fertig' : 'Schließen'}
            </button>
          ) : (
            <button
              onClick={commit}
              disabled={selectedCount === 0 || review.phase !== 'select'}
              className="w-full min-h-[48px] rounded-xl bg-primary-solid hover:bg-primary-solidHover disabled:bg-[#2a2a2a] disabled:text-[#9a9a9a] text-white text-base font-semibold transition-colors"
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
              onClick={close}
              disabled={review.phase === 'sending'}
              className="min-h-[48px] px-4 rounded-xl bg-[#1c1c1c] border border-[#2a2a2a] text-[#e5e5e5] text-base disabled:opacity-60"
            >
              Später
            </button>
            <button
              onClick={sync}
              disabled={review.phase === 'sending'}
              className="flex-1 min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-primary-solid hover:bg-primary-solidHover disabled:opacity-80 text-white text-base font-semibold transition-colors"
            >
              {review.phase === 'sending'
                ? <><RefreshCw size={17} className="animate-spin" /> Wird abgeglichen …</>
                : <><Send size={17} /> Abgleichen</>}
            </button>
          </div>
        )}
        {review.phase === 'sent' && (
          <div className="flex gap-2">
            {!review.sendResult?.ok && (
              <button
                onClick={sync}
                className="flex-1 min-h-[48px] rounded-xl bg-[#1c1c1c] border border-[#2a2a2a] text-[#e5e5e5] text-base"
              >
                Nochmal abgleichen
              </button>
            )}
            <button
              onClick={close}
              className="flex-1 min-h-[48px] rounded-xl bg-primary-solid hover:bg-primary-solidHover text-white text-base font-semibold"
            >
              Fertig
            </button>
          </div>
        )}
      </div>
    </Sheet>
  )
}
