'use client'

import { useEffect, useState } from 'react'
import { Sheet, SheetHeader } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { useCurrentUser } from '@/components/UserProvider'
import { apiCall } from '@/lib/apiCall'
import { addDaysIso } from '@/lib/planMoves'
import { dayLabel, relativeWeekday, todayIso } from '@/lib/dates'
import { track } from '@/lib/track'

// "Einplanen" from a recipe: the next 10 evenings, free ones first in the
// eye, occupied ones with their dish and "ersetzen". Sends what it saw
// (expect_empty / replace_id), so the partner's newer plan is never
// overwritten without asking.

type Entry = {
  id: string; date: string; recipe_id: string | null; custom_meal_name: string | null
  servings: number; notes: string; suggested_by: string
  recipe?: { name: string }
}

const DAYS = 10
const nameOf = (e: Entry) => e.recipe?.name || e.custom_meal_name || 'Essen'

export function PlanRecipeSheet({ recipe, onClose }: {
  recipe: { id: string; name: string }
  onClose: () => void
}) {
  const { user, users, askUser } = useCurrentUser()
  const { show: showToast, error: showError, hide: hideToast } = useToast()
  const today = todayIso()
  const dates = Array.from({ length: DAYS }, (_, i) => addDaysIso(today, i))
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const load = async () => {
    const res = await apiCall<Entry[]>(`/api/meal-plan?start=${today}&end=${addDaysIso(today, DAYS - 1)}`)
    if (res.ok) { setEntries(res.data); setLoadFailed(false) } else setLoadFailed(true)
  }

  useEffect(() => {
    load()
    // Loads once per open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const post = (body: Record<string, unknown>) => apiCall<Entry>('/api/meal-plan', {
    method: 'POST',
    body: { meal_type: 'dinner', servings: 2, status: 'approved', suggested_by: user, ...body },
    fallback: 'Konnte nicht gespeichert werden',
  })

  const plan = async (date: string, current: Entry | undefined) => {
    if (saving) return
    if (!user && users.length > 0) { askUser(); return }
    setSaving(date)
    const res = await post({ date, recipe_id: recipe.id, custom_meal_name: null, ...(current ? { replace_id: current.id } : { expect_empty: true }) })
    setSaving(null)
    if (res.status === 409) {
      // The partner planned something meanwhile: show it, offer to replace it anyway
      const now = (res.data as { current?: Entry } | null)?.current
      await load()
      if (now) {
        const who = now.suggested_by && now.suggested_by !== user ? `${now.suggested_by} hat` : 'Es ist'
        showToast(`${who} inzwischen ${nameOf(now)} geplant`, {
          action: { label: 'Trotzdem ersetzen', onClick: () => { hideToast(); plan(date, now) } },
        })
      }
      return
    }
    if (!res.ok) { showError(res.error); return }
    track(current ? 'plan_replace' : 'plan_add', { via: 'recipe' })
    onClose()
    const day = relativeWeekday(date, today)
    showToast(current ? `${day}: ${recipe.name} statt ${nameOf(current)}` : `${day}: ${recipe.name} geplant`, {
      action: {
        label: 'Rückgängig',
        onClick: async () => {
          hideToast()
          // Only while our plan is still there: the old dish comes back or the evening is free again
          const r = current
            ? await post({
              id: current.id, date, recipe_id: current.recipe_id, custom_meal_name: current.custom_meal_name,
              servings: current.servings || 2, notes: current.notes, suggested_by: current.suggested_by, replace_id: res.data.id,
            })
            : await apiCall(`/api/meal-plan/${res.data.id}`, { method: 'DELETE' })
          if (r.ok) showToast('Zurückgenommen')
          else showError(r.status === 409 || r.status === 404 ? 'Wurde inzwischen geändert' : r.error)
        },
      },
    })
  }

  const byDate = new Map((entries ?? []).map(e => [e.date, e]))

  return (
    <Sheet onClose={onClose}>
      <SheetHeader title="Einplanen" subtitle={recipe.name} />
      <div className="p-4 space-y-1.5 overflow-y-auto overscroll-contain">
        {loadFailed && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            Die nächsten Abende konnten nicht geladen werden.
            <button type="button" onClick={load} className="block mt-1 min-h-[40px] font-semibold text-red-200 underline underline-offset-2">
              Nochmal versuchen
            </button>
          </div>
        )}
        {!entries && !loadFailed && Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-[52px] rounded-xl" />)}
        {entries && dates.map(date => {
          const current = byDate.get(date)
          const same = current?.recipe_id === recipe.id
          return (
            <button key={date} type="button" onClick={() => plan(date, current)} disabled={!!saving || same}
              className={`w-full min-h-[52px] flex items-center gap-3 px-3 py-1.5 rounded-xl border text-left transition-all disabled:cursor-not-allowed ${
                current ? 'border-[#262626] bg-[#161616] hover:bg-[#1e1e1e]' : 'border-primary/40 bg-primary/10 hover:bg-primary/15'
              } ${same ? 'opacity-60' : ''}`}>
              <span className={`w-20 flex-shrink-0 text-sm font-semibold ${current ? 'text-ink-soft' : 'text-white'}`}>{dayLabel(date, today)}</span>
              <span className={`flex-1 min-w-0 truncate text-sm ${current ? 'text-ink-muted' : 'text-primary font-medium'}`}>
                {saving === date ? 'Wird geplant…' : current ? nameOf(current) : 'frei'}
              </span>
              {current && !same && <span className="flex-shrink-0 text-xs font-medium text-amber-300">ersetzen</span>}
              {same && <span className="flex-shrink-0 text-xs text-ink-hint">schon geplant</span>}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
