'use client'

import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PausableTimer, toastDuration } from '@/lib/toastTimer'

// One toast for the whole app, mounted in the layout. It sits in a live
// region that is always there (polite; errors assertive), so screen readers
// announce it. While a sheet is open everything outside the <dialog> is
// inert, so each sheet brings its own region (components/Sheet.tsx) and the
// toast shows in the topmost one.

export type ToastAction = { label: string; onClick: () => void }
export type ToastOptions = { action?: ToastAction; duration?: number }
type Tone = 'info' | 'error'
type Toast = { id: number; msg: string; action?: ToastAction; tone: Tone }

type ToastApi = {
  /** Replaces any toast on screen. With an action it stays 8 s, else 4 s. */
  show: (msg: string, opts?: ToastOptions) => void
  /** Same, announced right away (assertive). */
  error: (msg: string, opts?: ToastOptions) => void
  hide: () => void
}

const ApiCtx = createContext<ToastApi>({ show: () => {}, error: () => {}, hide: () => {} })

type Regions = {
  toast: Toast | null
  top: string | null
  register: (id: string, base?: boolean) => () => void
  hold: (on: boolean) => void
}
const RegionCtx = createContext<Regions | null>(null)

export const useToast = () => useContext(ApiCtx)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  // Registered regions, the layout's first; the last one shows the toast
  const [regions, setRegions] = useState<string[]>([])
  const timer = useRef<PausableTimer | null>(null)
  const seq = useRef(0)
  // Pointer over or focus inside the toast: its timer waits
  const held = useRef(false)

  const hide = useCallback(() => {
    held.current = false
    timer.current?.cancel()
    timer.current = null
    setToast(null)
  }, [])

  const api = useMemo<ToastApi>(() => {
    const open = (tone: Tone) => (msg: string, opts: ToastOptions = {}) => {
      timer.current?.cancel()
      // A toast that vanished under the pointer never gets its pointerleave
      held.current = false
      const id = ++seq.current
      setToast({ id, msg, action: opts.action, tone })
      const t = new PausableTimer(() => {
        if (timer.current === t) timer.current = null
        setToast(cur => (cur?.id === id ? null : cur))
      }, toastDuration(opts))
      timer.current = t
    }
    return { show: open('info'), error: open('error'), hide }
  }, [hide])

  const register = useCallback((id: string, base = false) => {
    setRegions(prev => (base ? [id, ...prev] : [...prev, id]))
    return () => setRegions(prev => prev.filter(r => r !== id))
  }, [])

  const hold = useCallback((on: boolean) => {
    held.current = on
    if (on) timer.current?.pause()
    else timer.current?.resume()
  }, [])

  const regionValue = useMemo<Regions>(
    () => ({ toast, top: regions[regions.length - 1] ?? null, register, hold }),
    [toast, regions, register, hold],
  )

  return (
    <ApiCtx.Provider value={api}>
      <RegionCtx.Provider value={regionValue}>
        {children}
        <ToastRegion base />
      </RegionCtx.Provider>
    </ApiCtx.Provider>
  )
}

/**
 * Where the toast appears: fixed above the tab bar (and the home indicator),
 * centred by a full-width wrapper so the slide-in animation, which sets
 * `transform`, cannot move it sideways.
 */
export function ToastRegion({ base = false }: { base?: boolean }) {
  const ctx = useContext(RegionCtx)
  const id = useId()
  const register = ctx?.register
  useLayoutEffect(() => register?.(id, base), [register, id, base])
  if (!ctx) return null
  const t = ctx.top === id ? ctx.toast : null

  const pill = t && (
    <div
      key={t.id}
      onPointerEnter={() => ctx.hold(true)}
      onPointerLeave={() => ctx.hold(false)}
      onFocus={() => ctx.hold(true)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) ctx.hold(false) }}
      className="pointer-events-auto flex items-center gap-2 pl-4 pr-1.5 min-h-[44px] max-w-full bg-[#1e1e1e] border border-[#333] rounded-[22px] text-sm text-white shadow-xl animate-slide-up"
    >
      {/* Two lines at most; messages start with the verb so only a long name is cut */}
      <span className={`min-w-0 my-2.5 leading-snug line-clamp-2 break-words ${t.action ? '' : 'pr-2.5'}`}>{t.msg}</span>
      {t.action && (
        <button type="button" onClick={t.action.onClick}
          className="min-h-[40px] px-3 rounded-full text-primary font-semibold hover:bg-white/5 transition-colors flex-shrink-0">
          {t.action.label}
        </button>
      )}
    </div>
  )

  return (
    <div className="fixed inset-x-0 bottom-toast md:left-56 z-[60] flex flex-col items-center px-4 pointer-events-none">
      <div role="status" aria-live="polite" aria-atomic="true" className="max-w-full">
        {t?.tone === 'info' && pill}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="max-w-full">
        {t?.tone === 'error' && pill}
      </div>
    </div>
  )
}
