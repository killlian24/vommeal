'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, CalendarRange, MoveRight } from 'lucide-react'
import { addDaysIso, applyMoves, planShift, type PlanMove } from '@/lib/planMoves'
import { EATING_OUT } from '@/lib/quickMeals'
import { Sheet, SheetHeader } from '@/components/Sheet'
import { dayLabel, rangeLabel, weekdayName } from '@/lib/dates'

type Planned = { id: string; date: string; recipe?: { name: string }; custom_meal_name: string | null }
type Intent = 'chain' | 'one'

const nameOf = (e: Planned) => e.recipe?.name || e.custom_meal_name || 'Essen'

/** One row of the before/after preview: day and what is planned there ('' = free). */
export type PreviewRow = { date: string; name: string }

/**
 * Before and after a shift, day by day from the first to the last day it
 * touches. `fill` is what the freed evening gets (e.g. "Auswärts essen").
 */
export function beforeAfter(planned: Planned[], moves: PlanMove[], fill: string | null): { before: PreviewRow[]; after: PreviewRow[] } {
  if (moves.length === 0) return { before: [], after: [] }
  const days = moves.flatMap(m => [m.from, m.to]).sort()
  const first = days[0]
  const last = days[days.length - 1]
  const range: string[] = []
  for (let d = first; d <= last; d = addDaysIso(d, 1)) range.push(d)
  const moved = applyMoves(planned, moves)
  const freed = moves.map(m => m.from).find(d => !moves.some(m => m.to === d))
  const at = (list: Planned[], date: string) => {
    const e = list.find(x => x.date === date)
    return e ? nameOf(e) : ''
  }
  return {
    before: range.map(date => ({ date, name: at(planned, date) })),
    after: range.map(date => ({ date, name: at(moved, date) || (date === freed && fill ? fill : '') })),
  }
}

/** "Heute Abend" / "Morgen Abend" / "Am Freitag" */
export function eveningLabel(date: string, today: string): string {
  if (date === today) return 'Heute Abend'
  if (date === addDaysIso(today, 1)) return 'Morgen Abend'
  return `Am ${weekdayName(date)}`
}

function PreviewList({ title, rows, today, highlight }: { title: string; rows: PreviewRow[]; today: string; highlight?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-hint mb-1">{title}</p>
      <ul className="space-y-0.5">
        {rows.map(r => (
          <li key={r.date} className="flex gap-2 text-sm leading-snug">
            <span className="w-16 flex-shrink-0 text-ink-muted">{dayLabel(r.date, today)}</span>
            <span className={`min-w-0 truncate ${r.name ? (r.name === highlight ? 'text-white font-medium' : 'text-ink-soft') : 'text-ink-hint italic'}`}>
              {r.name || 'frei'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

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
  // Two different things: the whole run of evenings slides, or one dish goes elsewhere
  const [intent, setIntent] = useState<Intent>(entry.date === today ? 'chain' : 'one')

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

  const byDate = new Map((planned ?? []).map(e => [e.date, e]))
  const later = planned ? planShift(planned, entry.date, 1) : null
  const earlier = planned ? planShift(planned, entry.date, -1) : null
  const dayBefore = addDaysIso(entry.date, -1)
  const canEarlier = !!earlier?.ok && dayBefore >= today
  const preview = planned && later?.ok ? beforeAfter(planned, later.moves, fill ? EATING_OUT : null) : null
  const earlierPreview = planned && canEarlier && earlier?.ok ? beforeAfter(planned, earlier.moves, null) : null

  // The rest of the shown week and the week after; days that are over are
  // left out (a past week falls back to the current one).
  const base = weekStart < mondayOf(today) ? mondayOf(today) : weekStart
  const weeks = [0, 7].map(offset => {
    const monday = addDaysIso(base, offset)
    return {
      monday,
      label: monday === mondayOf(today) ? 'Diese Woche'
        : monday === addDaysIso(mondayOf(today), 7) ? 'Nächste Woche'
        : rangeLabel(monday, addDaysIso(monday, 6)),
      days: Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i)).filter(d => d >= today),
    }
  }).filter(w => w.days.length > 0)

  const tab = (value: Intent, label: string, icon: React.ReactNode) => (
    <button type="button" role="radio" aria-checked={intent === value} onClick={() => setIntent(value)}
      className={`flex-1 min-h-[56px] flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm font-medium leading-snug transition-all ${
        intent === value ? 'bg-[#262626] text-white shadow' : 'text-ink-muted hover:text-white'
      }`}>
      <span className={intent === value ? 'text-primary' : ''} aria-hidden>{icon}</span>
      {label}
    </button>
  )

  return (
    <Sheet onClose={onClose}>
      <SheetHeader title="Verschieben" subtitle={`${dayLabel(entry.date, today)} · ${entry.name}`} />

      <div className="p-4 space-y-4 overflow-y-auto overscroll-contain">
        {/* What should happen? */}
        <div role="radiogroup" aria-label="Was soll passieren?" className="flex gap-1 p-1 rounded-xl bg-[#101010] border border-[#262626]">
          {tab('chain', 'Alles ab hier einen Tag später', <CalendarRange size={17} />)}
          {tab('one', 'Nur dieses Gericht auf einen anderen Tag', <MoveRight size={17} />)}
        </div>

        {intent === 'chain' ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">
              {entry.name} und die direkt folgenden Abende rutschen einen Tag nach hinten, bis zum nächsten freien Abend.
            </p>
            {preview ? (
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-3">
                <PreviewList title="Vorher" rows={preview.before} today={today} highlight={entry.name} />
                <PreviewList title="Nachher" rows={preview.after} today={today} highlight={entry.name} />
              </div>
            ) : (
              <p className="text-sm text-ink-hint">{loadFailed ? 'Vorschau nicht verfügbar' : 'Vorschau lädt…'}</p>
            )}
            <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
              <span className="text-lg" aria-hidden>🍽️</span>
              <span className="flex-1 text-sm text-ink-soft">{eveningLabel(entry.date, today)}: {EATING_OUT} eintragen</span>
              <input type="checkbox" checked={fill} onChange={e => setFill(e.target.checked)} className="sr-only peer" />
              <span aria-hidden className="relative flex-shrink-0 w-11 h-6 rounded-full bg-[#333] peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/60 transition-colors after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
            </label>
            <button onClick={() => onShift(1, fill)} disabled={busy || !later?.ok}
              className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-primary-solid hover:bg-primary-solidHover text-white text-sm font-semibold transition-all disabled:bg-bg-border disabled:text-ink-hint disabled:shadow-none">
              <ArrowDown size={16} /> Einen Tag später schieben
            </button>

            {/* One day earlier, only into a free evening that is not over yet */}
            {earlierPreview && (
              <button onClick={() => onShift(-1, false)} disabled={busy}
                className="w-full flex items-center gap-3 min-h-[52px] px-3 py-2 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#222] text-left transition-all disabled:opacity-50">
                <ArrowUp size={16} className="text-primary flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-white">Stattdessen einen Tag früher</span>
                  <span className="block text-sm text-ink-soft truncate">
                    {weekdayName(dayBefore)} ist frei
                  </span>
                </span>
              </button>
            )}
          </div>
        ) : (
          /* Any other evening; an occupied one swaps */
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">Tag antippen. Ist er belegt, tauschen die beiden Gerichte ihre Tage.</p>
            {weeks.map(w => (
              <div key={w.monday} className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-hint">{w.label}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {w.days.map(date => {
                    const other = byDate.get(date)
                    const isCurrent = date === entry.date
                    const disabled = busy || isCurrent || !planned
                    return (
                      <button key={date} onClick={() => onMoveTo(date)} disabled={disabled}
                        className={`min-h-[52px] flex flex-col justify-center px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                          isCurrent ? 'border-primary/40 bg-primary/10'
                            : other ? 'border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#232323]'
                            : 'border-dashed border-[#333] bg-[#121212] hover:bg-[#1c1c1c]'
                        } disabled:cursor-not-allowed`}>
                        <span className="flex items-center justify-between gap-1 text-sm font-semibold text-white">
                          {dayLabel(date, today)}
                          {!isCurrent && other && (
                            <span className="text-[11px] font-medium text-amber-300">tauschen</span>
                          )}
                        </span>
                        <span className={`text-xs truncate ${other ? 'text-ink-soft' : 'text-ink-hint'}`}>
                          {isCurrent ? 'jetzt hier' : other ? nameOf(other) : 'frei'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
}

function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  return addDaysIso(date, dow === 0 ? -6 : 1 - dow)
}
