'use client'

// Editor cards for the notification texts: one per kind, with placeholder
// chips, a character counter and a live preview styled like a phone
// notification. Empty text means "use the default".

import { useRef } from 'react'
import { RotateCcw } from 'lucide-react'
import {
  NOTIFY_KIND_LABELS, NOTIFY_PLACEHOLDERS, NOTIFY_TEXT_MAX, renderNotifyText,
} from '@/lib/notifyTemplates'
import type { NotifyKind } from '@/lib/notifyTemplates'
import { Hint } from './ui'

/** Order used for the text cards and the test menu. */
export const NOTIFY_KIND_ORDER: NotifyKind[] = ['daily_empty', 'daily_planned', 'weekly']

export const EXAMPLE_GERICHT = 'Linsen mit Spätzle'
export const EXAMPLE_VORSCHLAG = 'Butter Chicken'
export const EXAMPLE_ANZAHL = 4

/** Buttons that open the app; the server only sends them when the app address is set. */
const LINK_BUTTONS: Partial<Record<NotifyKind, string>> = { daily_empty: 'Andere Ideen', weekly: 'Selbst planen' }

/** Button labels the phone shows under each kind of notification. */
export function notifyButtonLabels(kind: NotifyKind, hasAppUrl: boolean): string[] {
  const link = hasAppUrl && LINK_BUTTONS[kind] ? [LINK_BUTTONS[kind] as string] : []
  if (kind === 'daily_empty') return [`${EXAMPLE_VORSCHLAG} kochen`, 'Reste', ...link]
  if (kind === 'weekly') return ['Woche füllen', ...link]
  return []
}

/** Placeholders like {xyz} that this kind does not know (they would show up literally). */
function unknownPlaceholders(kind: NotifyKind, text: string): string[] {
  const known = new Set(NOTIFY_PLACEHOLDERS[kind].map(p => p.key))
  const found = Array.from(text.matchAll(/\{([^{}\s]*)\}/g), m => m[1])
  return Array.from(new Set(found.filter(key => !known.has(key)))).map(key => `{${key}}`)
}

export function NotifyPreview({ kind, text, hasAppUrl }: { kind: NotifyKind; text: string; hasAppUrl: boolean }) {
  const buttons = notifyButtonLabels(kind, hasAppUrl)
  return (
    <div className="rounded-2xl bg-[#232323] border border-[#333] px-3 py-2.5 shadow-sm" aria-label="Vorschau der Nachricht">
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={20} height={20} className="h-5 w-5 rounded-[5px] flex-shrink-0" />
        <span className="text-[13px] font-semibold text-white">Vommeal</span>
        <span className="ml-auto text-[11px] text-[#9a9a9a]">jetzt</span>
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-[#e8e8e8] break-words">
        {text || <span className="text-[#9a9a9a] italic">(leer)</span>}
      </p>
      {buttons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {buttons.map(b => (
            <span key={b} className="rounded-full bg-[#333] px-2.5 py-1 text-[12px] text-[#dcdcdc]">{b}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export function NotifyTextCard({ kind, value, defaultText, previewName, hasAppUrl, onChange }: {
  kind: NotifyKind
  value: string
  defaultText: string
  previewName: string
  hasAppUrl: boolean
  onChange: (value: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const isDefault = value.trim() === '' || value.trim() === defaultText.trim()
  const effective = value.trim() ? value : defaultText
  const preview = renderNotifyText(effective, {
    name: previewName, gericht: EXAMPLE_GERICHT, vorschlag: EXAMPLE_VORSCHLAG, anzahl: EXAMPLE_ANZAHL,
  })
  const unknown = unknownPlaceholders(kind, effective)
  const id = `notify-text-${kind}`

  const insert = (key: string) => {
    const el = ref.current
    const token = `{${key}}`
    // An empty field stands for the default text, so edit that instead of starting blank
    const base = value === '' ? defaultText : value
    const start = value === '' || !el ? base.length : el.selectionStart ?? base.length
    const end = value === '' || !el ? base.length : el.selectionEnd ?? start
    const next = base.slice(0, start) + token + base.slice(end)
    if (next.length > NOTIFY_TEXT_MAX) return
    onChange(next)
    requestAnimationFrame(() => {
      if (!ref.current) return
      ref.current.focus()
      const caret = start + token.length
      ref.current.setSelectionRange(caret, caret)
    })
  }

  const length = value.length
  const nearLimit = length > NOTIFY_TEXT_MAX - 20

  return (
    <div className="rounded-lg border border-[#262626] bg-[#0f0f0f] p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-white min-w-0">
          {NOTIFY_KIND_LABELS[kind]}
          {isDefault && <span className="ml-2 text-[11px] font-normal text-[#9a9a9a]">Standardtext</span>}
        </label>
        <button
          type="button"
          onClick={() => onChange('')}
          disabled={value === ''}
          className="-mr-1 inline-flex items-center gap-1 min-h-[40px] px-2.5 rounded-lg text-xs text-[#c4c4c4] hover:text-white hover:bg-[#1f1f1f] disabled:opacity-40 disabled:hover:bg-transparent flex-shrink-0"
        >
          <RotateCcw size={13} />
          Standard
        </button>
      </div>

      <div>
        <textarea
          id={id}
          ref={ref}
          rows={3}
          value={value}
          maxLength={NOTIFY_TEXT_MAX}
          placeholder={defaultText}
          onFocus={() => { if (value === '') onChange(defaultText) }}
          onChange={e => onChange(e.target.value)}
          // 16 px keeps iOS from zooming into the field
          className="block resize-y min-h-[76px] text-[16px] leading-snug"
        />
        <div className="mt-1 flex items-start justify-between gap-2">
          {unknown.length > 0 ? (
            <p className="text-xs text-amber-300">
              Unbekannter Platzhalter: {unknown.join(', ')} – wird so angezeigt.
            </p>
          ) : <span />}
          <span className={`text-[11px] tabular-nums flex-shrink-0 ${nearLimit ? 'text-amber-300' : 'text-[#9a9a9a]'}`} aria-live="polite">
            {length}/{NOTIFY_TEXT_MAX}
          </span>
        </div>
      </div>

      <div>
        <p className="text-[11px] text-[#9a9a9a] mb-1">Platzhalter einfügen</p>
        <div className="flex flex-wrap gap-1.5">
          {NOTIFY_PLACEHOLDERS[kind].map(p => (
            <button
              key={p.key}
              type="button"
              // Keep the cursor (and the phone keyboard) in the text field
              onPointerDown={e => e.preventDefault()}
              onClick={() => insert(p.key)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full border border-[#333] bg-[#1c1c1c] hover:bg-[#252525] text-xs text-[#d4d4d4]"
            >
              <span className="font-mono text-primary">{`{${p.key}}`}</span>
              <span className="text-[#a8a8a8]">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] text-[#9a9a9a] mb-1">Vorschau für {previewName}</p>
        <NotifyPreview kind={kind} text={preview} hasAppUrl={hasAppUrl} />
        {!hasAppUrl && LINK_BUTTONS[kind] && (
          <Hint className="mt-1">Der Knopf „{LINK_BUTTONS[kind]}“ kommt dazu, sobald unten die App-Adresse eingetragen ist.</Hint>
        )}
      </div>
    </div>
  )
}

export function NotifyTextsHint() {
  return (
    <Hint className="mt-0.5 mb-2">
      Leer lassen oder „Standard“ tippen, um den Standardtext zu nutzen. Bei Handys ohne Person fällt {'{name}'} automatisch weg.
    </Hint>
  )
}
