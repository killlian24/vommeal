'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, Check, ListChecks, Sun, ExternalLink } from 'lucide-react'

type Ingredient = { amount: string; unit: string; name: string; note?: string }
type Instruction = { text: string }

type Props = {
  name: string
  ingredients: Ingredient[]
  instructions: Instruction[]
  /** Link to the recipe in Mealie, shown when ingredients are missing. */
  mealieUrl?: string | null
  fromMealie: boolean
  onClose: () => void
}

type WakeLockState = 'pending' | 'active' | 'unsupported'

// Minimal typing so this compiles regardless of the TS DOM lib version.
type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener?: (t: 'release', cb: () => void) => void }
type WakeLockLike = { request: (type: 'screen') => Promise<WakeLockSentinelLike> }

/** Keeps the screen on while mounted. Re-acquires after the tab becomes visible again. */
function useWakeLock(): WakeLockState {
  const [state, setState] = useState<WakeLockState>('pending')
  const sentinel = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock
    if (!wakeLock) { setState('unsupported'); return }
    let disposed = false

    const acquire = async () => {
      if (disposed || document.visibilityState !== 'visible') return
      try {
        const s = await wakeLock.request('screen')
        if (disposed) { s.release().catch(() => {}); return }
        sentinel.current = s
        s.addEventListener?.('release', () => { if (sentinel.current === s) sentinel.current = null })
        setState('active')
      } catch {
        // Denied (battery saver, not visible, iOS home-screen quirks): cooking still works.
        setState('unsupported')
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel.current) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      sentinel.current?.release().catch(() => {})
      sentinel.current = null
    }
  }, [])

  return state
}

/** Shown when a recipe has fewer than 3 ingredients (typical for thin Mealie imports). */
export function FewIngredientsHint({ fromMealie, mealieUrl, className = '' }: { fromMealie: boolean; mealieUrl?: string | null; className?: string }) {
  return (
    <p className={`text-sm text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 ${className}`}>
      {fromMealie ? 'In Mealie sind kaum Zutaten hinterlegt – dort ergänzen.' : 'Kaum Zutaten hinterlegt – über „Bearbeiten“ ergänzen.'}
      {fromMealie && mealieUrl && (
        <a href={mealieUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 ml-1.5 font-medium text-amber-100 underline underline-offset-2">
          In Mealie öffnen <ExternalLink size={12} />
        </a>
      )}
    </p>
  )
}

function amountText(ing: Ingredient): string {
  return [ing.amount, ing.unit].filter(Boolean).join(' ')
}

/**
 * Full-screen cooking view: ingredient checklist first (step -1),
 * then one instruction per screen in large type.
 */
export default function CookMode({ name, ingredients, instructions, mealieUrl, fromMealie, onClose }: Props) {
  const steps = instructions.filter(s => s.text.trim())
  const [step, setStep] = useState(-1)
  const [lastStep, setLastStep] = useState(0)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const wakeLock = useWakeLock()
  const scrollRef = useRef<HTMLDivElement>(null)

  const onIngredients = step === -1
  const isLast = step === steps.length - 1
  const total = steps.length

  const goTo = useCallback((next: number) => {
    setStep(next)
    if (next >= 0) setLastStep(next)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [])

  const next = useCallback(() => {
    if (onIngredients) { goTo(total > 0 ? lastStep : 0); return }
    if (step < total - 1) goTo(step + 1)
    else onClose()
  }, [onIngredients, total, lastStep, step, goTo, onClose])

  const back = useCallback(() => {
    if (step > 0) goTo(step - 1)
    else if (step === 0) goTo(-1)
  }, [step, goTo])

  // Lock page scroll behind the overlay; keyboard shortcuts for tablets/desktop.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [next, back, onClose])

  const toggle = (i: number) =>
    setChecked(prev => {
      const s = new Set(prev)
      if (s.has(i)) s.delete(i)
      else s.add(i)
      return s
    })

  const progress = total > 0 ? ((step + 1) / (total + 1)) * 100 : onIngredients ? 50 : 100
  const nextLabel = onIngredients
    ? (total === 0 ? 'Fertig' : lastStep > 0 ? `Weiter zu Schritt ${lastStep + 1}` : 'Los geht\'s')
    : isLast ? 'Fertig' : 'Weiter'

  // Portal to <body> so parent layout styles (e.g. space-y margins) cannot offset the overlay.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Kochmodus: ${name}`}
      className="fixed inset-0 z-[60] flex flex-col bg-[#0a0a0a] animate-slide-up"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-[#1e1e1e]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Kochmodus schließen"
          className="w-11 h-11 flex items-center justify-center rounded-full bg-[#1c1c1c] text-ink-soft active:scale-95 transition-all flex-shrink-0"
        >
          <X size={20} />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <p className="text-sm font-semibold text-white truncate">{name}</p>
          <p className="text-xs text-ink-muted tabular-nums" aria-live="polite">
            {onIngredients ? 'Zutaten' : `Schritt ${step + 1} von ${total}`}
          </p>
        </div>
        {onIngredients ? (
          <div className="w-11 flex-shrink-0" />
        ) : (
          <button
            type="button"
            onClick={() => goTo(-1)}
            aria-label="Zutaten anzeigen"
            className="w-11 h-11 flex items-center justify-center rounded-full bg-[#1c1c1c] text-ink-soft active:scale-95 transition-all flex-shrink-0"
          >
            <ListChecks size={19} />
          </button>
        )}
      </div>
      <div className="h-1 bg-[#1a1a1a]">
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-5 py-6">
        {onIngredients ? (
          <div className="max-w-xl mx-auto">
            <h2 className="text-xl font-bold text-white mb-1">Zutaten</h2>
            <p className="text-sm text-ink-muted mb-4">Antippen, was bereitsteht.</p>
            {ingredients.length === 0 ? (
              <p className="text-base text-ink-muted">Keine Zutaten hinterlegt.</p>
            ) : (
              <ul className="space-y-2">
                {ingredients.map((ing, i) => {
                  const done = checked.has(i)
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => toggle(i)}
                        aria-pressed={done}
                        className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl border transition-all ${
                          done ? 'border-[#1e1e1e] bg-[#101010]' : 'border-[#2a2a2a] bg-[#161616]'
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          done ? 'bg-primary border-primary' : 'border-[#555]'
                        }`}>
                          {done && <Check size={16} className="text-white" strokeWidth={3} />}
                        </span>
                        <span className={`flex-1 text-lg leading-snug ${done ? 'text-ink-hint line-through' : 'text-white'}`}>
                          {amountText(ing) && <span className="font-semibold text-primary mr-1.5">{amountText(ing)}</span>}
                          {ing.name}
                          {ing.note && <span className="text-ink-muted text-base"> ({ing.note})</span>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {ingredients.length < 3 && (
              <FewIngredientsHint fromMealie={fromMealie} mealieUrl={mealieUrl} className="mt-4" />
            )}
            {total === 0 && (
              <p className="mt-4 text-sm text-ink-muted">Für dieses Rezept sind keine Zubereitungsschritte hinterlegt.</p>
            )}
          </div>
        ) : (
          <div className="max-w-xl mx-auto">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary mb-4">Schritt {step + 1}</p>
            <p className="text-2xl leading-relaxed text-white whitespace-pre-line">{steps[step].text}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pt-3 pb-4 border-t border-[#1e1e1e] space-y-2">
        <div className="flex gap-3 max-w-xl mx-auto">
          <button
            type="button"
            onClick={back}
            disabled={onIngredients}
            className="flex items-center justify-center gap-1 w-1/3 h-14 rounded-2xl bg-[#1c1c1c] border border-[#2a2a2a] text-base font-medium text-ink-soft active:scale-[0.97] transition-all disabled:opacity-30"
          >
            <ChevronLeft size={20} /> Zurück
          </button>
          <button
            type="button"
            onClick={next}
            className="flex-1 flex items-center justify-center gap-1 h-14 rounded-2xl bg-primary hover:bg-primary-hover text-white text-base font-semibold active:scale-[0.97] transition-all"
          >
            {nextLabel}
            {!(isLast && !onIngredients) && total > 0 && <ChevronRight size={20} />}
          </button>
        </div>
        <p className="flex items-center justify-center gap-1 text-[11px] text-ink-hint" aria-live="polite">
          {wakeLock === 'active' ? (
            <><Sun size={11} /> Bildschirm bleibt an</>
          ) : wakeLock === 'unsupported' ? (
            'Bildschirm kann hier ausgehen – ab und zu antippen'
          ) : ' '}
        </p>
      </div>
    </div>,
    document.body,
  )
}
