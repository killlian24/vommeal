'use client'

import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { X, ArrowDown, ArrowUp } from 'lucide-react'
import { addDaysIso, planShift, type PlanMove } from '@/lib/planMoves'
import { EATING_OUT } from '@/lib/quickMeals'

type Planned = { id: string; date: string; recipe?: { name: string }; custom_meal_name: string | null }

const fmt = (date: string, pattern: string) => format(parseISO(date), pattern, { locale: de })
const nameOf = (e: Planned) => e.recipe?.name || e.custom_meal_name || 'Essen'
const short = (name: string) => (name.length > 24 ? `${name.slice(0, 22).trimEnd()}…` : name)

/** "Linsen → Sa, Tajine → So" (at most four, then "+2 weitere"). */
export function describeMoves(moves: PlanMove[], names: Map<string, string>): string {
  const parts = moves.slice(0, 4).map(m => `${short(names.get(m.id) ?? 'Essen')} → ${fmt(m.to, 'EEEEEE')}`)
  if (moves.length > 4) parts.push(`+${moves.length - 4} weitere`)
  return parts.join(', ')
}

/** "Heute Abend" / "Morgen Abend" / "Am Freitag" */
export function eveningLabel(date: string, today: string): string {
  if (date === today) return 'Heute Abend'
  if (date === addDaysIso(today, 1)) return 'Morgen Abend'
  return `Am ${fmt(date, 'EEEE')}`
}

const iconBtn = 'w-10 h-10 flex items-center justify-center rounded-lg transition-all'

export function MoveSheet({ entry, weekStart, today, busy, onClose, onShift, onMoveTo }: {
  entry: { id: string; date: string; name: string }
  /** Monday of the week shown on the plan page */
  weekStart: string
  today: string
  busy: boolean
  onClose: () => void
  onShift: (days: 1 | -1, fillEatingOut: boolean) => void
  onMoveTo: (date: string) => void
}) {
  const [planned, setPlanned] = useState<Planned[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [fill, setFill] = useState(entry.date === today)

  useEffect(() => {
    let cancelled = false
    const start = addDaysIso(entry.date < weekStart ? entry.date : weekStart, -1)
    const end = addDaysIso(weekStart, 41)
    fetch(`/api/meal-plan?start=${start}&end=${end}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then((data: Planned[]) => { if (!cancelled) setPlanned(data) })
      .catch(() => { if (!cancelled) setLoadFailed(true) })
    return () => { cancelled = true }
  }, [entry.date, weekStart])

  const names = new Map((planned ?? []).map(e => [e.id, nameOf(e)]))
  const byDate = new Map((planned ?? []).map(e => [e.date, e]))
  const later = planned ? planShift(planned, entry.date, 1) : null
  const earlier = planned ? planShift(planned, entry.date, -1) : null
  const dayBefore = addDaysIso(entry.date, -1)
  const canEarlier = !!earlier?.ok && dayBefore >= today

  const laterText = later?.ok
    ? `${describeMoves(later.moves, names)} (${fmt(later.moves[later.moves.length - 1].to, 'EEEE')} war frei)`
    : loadFailed ? 'Vorschau nicht verfügbar' : '…'

  // The rest of the shown week and the week after; days that are over are
  // left out (a past week falls back to the current one).
  const base = weekStart < mondayOf(today) ? mondayOf(today) : weekStart
  const weeks = [0, 7].map(offset => {
    const monday = addDaysIso(base, offset)
    return {
      monday,
      label: monday === mondayOf(today) ? 'Diese Woche'
        : monday === addDaysIso(mondayOf(today), 7) ? 'Nächste Woche'
        : `${fmt(monday, 'd.M.')} – ${fmt(addDaysIso(monday, 6), 'd.M.')}`,
      days: Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i)).filter(d => d >= today),
    }
  }).filter(w => w.days.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-label="Verschieben"
        className="w-full max-w-md max-h-[90dvh] flex flex-col bg-[#141414] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl animate-slide-up pb-safe">
        <div className="flex items-center justify-between pl-4 pr-2 py-2 border-b border-[#222] flex-shrink-0">
          <div className="min-w-0">
            <p className="font-semibold text-white">Verschieben</p>
            <p className="text-sm text-ink-muted truncate">{fmt(entry.date, 'EEEEEE d.M.')} · {entry.name}</p>
          </div>
          <button onClick={onClose} aria-label="Schließen" className={`${iconBtn} text-ink-muted hover:text-white hover:bg-[#222]`}>
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* One day later, the following evenings slide along */}
          <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-3 space-y-3">
            <div>
              <p className="flex items-center gap-1.5 text-[15px] font-semibold text-white">
                <ArrowDown size={16} className="text-primary" /> Ab hier 1 Tag später
              </p>
              <p className="text-sm text-ink-soft mt-1">{laterText}</p>
            </div>
            <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
              <span className="text-lg" aria-hidden>🍽️</span>
              <span className="flex-1 text-sm text-ink-soft">{eveningLabel(entry.date, today)}: {EATING_OUT} eintragen</span>
              <input type="checkbox" checked={fill} onChange={e => setFill(e.target.checked)} className="sr-only peer" />
              <span aria-hidden className="relative flex-shrink-0 w-11 h-6 rounded-full bg-[#333] peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/60 transition-colors after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
            </label>
            <button onClick={() => onShift(1, fill)} disabled={busy || !later?.ok}
              className="w-full min-h-[44px] rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-all disabled:opacity-50">
              1 Tag später schieben
            </button>
          </div>

          {/* One day earlier, only into a free evening that is not over yet */}
          {canEarlier && earlier?.ok && (
            <button onClick={() => onShift(-1, false)} disabled={busy}
              className="w-full flex items-center gap-3 min-h-[52px] px-3 py-2 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#222] text-left transition-all disabled:opacity-50">
              <ArrowUp size={16} className="text-primary flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-white">1 Tag früher</span>
                <span className="block text-sm text-ink-soft">{describeMoves(earlier.moves, names)}</span>
              </span>
            </button>
          )}

          {/* Any other evening; an occupied one swaps */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">Auf anderen Tag</p>
            {weeks.map(w => (
              <div key={w.monday} className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-hint">{w.label}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {w.days.map(date => {
                    const other = byDate.get(date)
                    const isCurrent = date === entry.date
                    const past = date < today
                    const disabled = busy || isCurrent || past || !planned
                    return (
                      <button key={date} onClick={() => onMoveTo(date)} disabled={disabled}
                        className={`min-h-[52px] flex flex-col justify-center px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                          isCurrent ? 'border-primary/40 bg-primary/10'
                            : past ? 'border-[#1e1e1e] bg-[#0f0f0f] opacity-50'
                            : other ? 'border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#232323]'
                            : 'border-dashed border-[#333] bg-[#121212] hover:bg-[#1c1c1c]'
                        } disabled:cursor-not-allowed`}>
                        <span className="flex items-center justify-between gap-1 text-sm font-semibold text-white">
                          {fmt(date, 'EEEEEE d.M.')}
                          {!isCurrent && !past && other && (
                            <span className="text-[11px] font-medium text-amber-300">tauschen</span>
                          )}
                        </span>
                        <span className={`text-xs truncate ${other ? 'text-ink-soft' : 'text-ink-hint'}`}>
                          {isCurrent ? 'jetzt hier' : other ? nameOf(other) : past ? 'vorbei' : 'frei'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-ink-hint">Tipp: Im Wochenplan ein Gericht lange drücken und auf einen anderen Tag ziehen.</p>
        </div>
      </div>
    </div>
  )
}

function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  return addDaysIso(date, dow === 0 ? -6 : 1 - dow)
}
