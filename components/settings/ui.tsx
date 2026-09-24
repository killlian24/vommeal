'use client'

// Small building blocks shared by the settings page sections.
// Colours are chosen for readable contrast on the dark card background:
// body text #a8a8a8, hints #8f8f8f, labels #c4c4c4. Every tappable control
// is at least 40 px high so it works comfortably on a phone.

import type { ReactNode } from 'react'
import { Check, ChevronDown, Save, X } from 'lucide-react'

export type AuthedFetch = (url: string, init?: RequestInit) => Promise<Response>

export function Section({ id, icon, title, meta, open, onToggle, children }: {
  id: string
  icon: string
  title: string
  meta?: ReactNode
  open: boolean
  onToggle: (id: string) => void
  children: ReactNode
}) {
  return (
    <section className="bg-[#141414] border border-[#262626] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={open}
        aria-controls={`settings-${id}`}
        className="w-full min-h-[56px] flex items-center justify-between gap-3 px-5 py-3 hover:bg-[#1a1a1a] transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-base" aria-hidden>{icon}</span>
          <h2 className="font-semibold text-white">{title}</h2>
          {meta}
        </div>
        <ChevronDown size={18} className={`text-[#8f8f8f] transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={`settings-${id}`} className="px-5 py-4 space-y-5 border-t border-[#262626]">
          {children}
        </div>
      )}
    </section>
  )
}

export function MetaText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`text-xs text-[#9a9a9a] truncate max-w-[160px] ${className}`}>{children}</span>
}

export function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block text-[13px] font-medium text-[#c4c4c4] mb-1.5">{children}</label>
}

export function Hint({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs leading-relaxed text-[#8f8f8f] mt-1.5 ${className}`}>{children}</p>
}

export function Toggle({ id, checked, onChange, label, description, disabled }: {
  id: string
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: ReactNode
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 pt-2">
        <label htmlFor={id} className="block text-sm font-medium text-white cursor-pointer">{label}</label>
        {description && <p className="text-xs leading-relaxed text-[#8f8f8f] mt-1">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="flex-shrink-0 h-11 w-14 flex items-center justify-center disabled:opacity-40"
      >
        <span className={`relative inline-block h-7 w-12 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-[#3a3a3a]'}`}>
          <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
        </span>
      </button>
    </div>
  )
}

export function PrimaryButton({ onClick, disabled, done, label, doneLabel = 'Gespeichert' }: {
  onClick: () => void
  disabled?: boolean
  done?: boolean
  label: string
  doneLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all disabled:opacity-50"
    >
      {done ? <><Check size={15} /> {doneLabel}</> : <><Save size={15} /> {label}</>}
    </button>
  )
}

export const secondaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#333] text-sm text-[#c4c4c4] hover:text-white transition-all disabled:opacity-40'

export function StatusBox({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div
      role="status"
      className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm border ${
        ok ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-300'
      }`}
    >
      {ok ? <Check size={15} className="mt-0.5 flex-shrink-0" /> : <X size={15} className="mt-0.5 flex-shrink-0" />}
      <div className="min-w-0 break-words">{children}</div>
    </div>
  )
}

/** Reads an `{error}` message from a failed response, falling back to a German default. */
export async function responseError(res: Response, fallback = 'Speichern hat nicht geklappt.'): Promise<string> {
  if (res.status === 401) return 'Admin-Passwort fehlt oder ist falsch.'
  try {
    const data = await res.json()
    if (data && typeof data.error === 'string' && data.error) return data.error
  } catch { /* not JSON */ }
  return fallback
}
