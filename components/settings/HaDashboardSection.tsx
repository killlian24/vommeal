'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, Copy, Send } from 'lucide-react'
import { Hint, StatusBox, Toggle, responseError, secondaryButtonClass } from './ui'
import type { AuthedFetch } from './ui'
import { DASHBOARD_CARD_YAML, SENSOR_IDS, calendarFeedUrl } from '@/lib/haDashboardCard'

/** Copy to the clipboard; falls back to execCommand on plain-http pages (no Clipboard API there). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* try the fallback */ }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  area.remove()
  return ok
}

/** Copies `text`; if the browser refuses, selects the element `selectId` so it can be copied by hand. */
function CopyButton({ text, selectId, ariaLabel }: { text: string; selectId: string; ariaLabel?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  const copy = async () => {
    const ok = await copyText(text)
    setState(ok ? 'done' : 'failed')
    if (!ok) {
      const el = document.getElementById(selectId)
      if (el) window.getSelection()?.selectAllChildren(el)
    }
    setTimeout(() => setState('idle'), ok ? 2000 : 4000)
  }
  return (
    <button type="button" onClick={copy} aria-label={ariaLabel} className={`${secondaryButtonClass} flex-shrink-0`}>
      {state === 'done' ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
      {state === 'done' ? 'Kopiert' : state === 'failed' ? 'Markiert – jetzt kopieren' : 'Kopieren'}
    </button>
  )
}

function SubHeading({ children }: { children: ReactNode }) {
  return <p className="text-[13px] font-medium text-[#c4c4c4]">{children}</p>
}

export function HaDashboardSection({ enabled: initialEnabled, haConfigured, appUrl, authedFetch, onSaved }: {
  enabled: boolean
  haConfigured: boolean
  appUrl: string
  authedFetch: AuthedFetch
  onSaved: (enabled: boolean) => void
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<{ ok: boolean; error?: string } | null>(null)
  // window.location is only known in the browser
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])

  const feedUrl = appUrl || origin ? calendarFeedUrl(appUrl, origin) : ''

  const toggle = async (value: boolean) => {
    setEnabled(value); setSaveError(''); setPushResult(null); setSaving(true)
    try {
      const res = await authedFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ha_dashboard_enabled: value ? '1' : '0' }),
      })
      if (!res.ok) { setEnabled(!value); setSaveError(await responseError(res)); return }
      onSaved(value)
    } catch {
      setEnabled(!value)
      setSaveError('Keine Verbindung zu Vommeal.')
    } finally {
      setSaving(false)
    }
  }

  const push = async () => {
    setPushing(true); setPushResult(null)
    try {
      const res = await fetch('/api/ha/dashboard-push', { method: 'POST' })
      const data = await res.json().catch(() => null)
      setPushResult(data && typeof data.ok === 'boolean' ? data : { ok: false, error: `HTTP ${res.status}` })
    } catch {
      setPushResult({ ok: false, error: 'Keine Verbindung zu Vommeal.' })
    } finally {
      setPushing(false)
    }
  }

  return (
    <>
      <Toggle
        id="ha-dashboard-enabled"
        label="Wochenplan an Home Assistant senden"
        description="Vommeal legt die Sensoren selbst an und hält sie aktuell. In Home Assistant muss nichts eingerichtet werden."
        checked={enabled}
        disabled={saving}
        onChange={toggle}
      />
      {saveError && <StatusBox ok={false}>{saveError}</StatusBox>}

      <div className="space-y-1.5">
        <SubHeading>Sensoren</SubHeading>
        <ul className="space-y-1 text-xs text-[#a8a8a8]">
          {([
            [SENSOR_IDS.heute, 'Gericht heute'],
            [SENSOR_IDS.morgen, 'Gericht morgen'],
            [SENSOR_IDS.woche, 'ganze Woche, z. B. „5/7“'],
          ] as const).map(([id, what]) => (
            <li key={id} className="break-words">
              <code className="font-mono text-white break-all">{id}</code> – {what}
            </li>
          ))}
        </ul>
        {!haConfigured && <Hint>Zuerst oben unter „Home Assistant“ Adresse und Token eintragen.</Hint>}
        {!appUrl && <Hint>Für Bilder und Links die App-Adresse unter Benachrichtigungen eintragen.</Hint>}
      </div>

      <div className="space-y-2">
        <button type="button" onClick={push} disabled={pushing || !enabled || !haConfigured} className={secondaryButtonClass}>
          <Send size={15} className={pushing ? 'animate-pulse' : ''} />
          {pushing ? 'Wird gesendet …' : 'Jetzt senden'}
        </button>
        {pushResult && (
          <StatusBox ok={pushResult.ok}>
            {pushResult.ok ? 'Gesendet. Die Sensoren sind jetzt in Home Assistant.' : pushResult.error || 'Senden hat nicht geklappt.'}
          </StatusBox>
        )}
        {enabled && haConfigured && !pushResult && (
          <Hint className="mt-0">Wird automatisch aktualisiert, sobald sich der Plan ändert, und sonst alle 30 Minuten.</Hint>
        )}
      </div>

      <div className="border-t border-[#262626] pt-4 space-y-2">
        <SubHeading>Karte fürs Dashboard</SubHeading>
        <Hint className="mt-0">
          Dashboard → ✏️ Bearbeiten → Karte hinzufügen → ganz unten „Manuell“ → alles ersetzen und einfügen.
        </Hint>
        <pre id="ha-dashboard-yaml" className="bg-[#0f0f0f] border border-[#262626] rounded-lg px-3 py-2.5 text-xs leading-relaxed text-[#d0d0d0] overflow-x-auto max-w-full">
          <code>{DASHBOARD_CARD_YAML}</code>
        </pre>
        <CopyButton text={DASHBOARD_CARD_YAML} selectId="ha-dashboard-yaml" ariaLabel="Karten-YAML kopieren" />
        <Hint className="mt-0">
          Die Kacheln zeigen das Rezeptfoto als rundes Bild, sonst Messer und Gabel. Antippen öffnet die Details mit dem Rezept-Link.
        </Hint>
      </div>

      <div className="border-t border-[#262626] pt-4 space-y-2">
        <SubHeading>Kalender</SubHeading>
        <Hint className="mt-0">Alle geplanten Abende als Kalender-Abo (2 Wochen zurück, 6 Wochen voraus, stündlich aktualisiert).</Hint>
        <p
          id="ha-dashboard-feed"
          aria-label="Kalender-Adresse"
          className="bg-[#0f0f0f] border border-[#262626] rounded-lg px-3 py-2.5 font-mono text-xs text-[#d0d0d0] break-all select-all"
        >
          {feedUrl || ' '}
        </p>
        <CopyButton text={feedUrl} selectId="ha-dashboard-feed" ariaLabel="Kalender-Adresse kopieren" />
        <ul className="space-y-1.5 text-xs leading-relaxed text-[#a8a8a8] list-disc pl-4">
          <li>
            <span className="text-[#c4c4c4]">Home Assistant:</span> Einstellungen → Geräte &amp; Dienste → Integration hinzufügen → Remote Calendar → diese Adresse einfügen.
          </li>
          <li>
            <span className="text-[#c4c4c4]">iPhone:</span> Einstellungen → Kalender → Accounts → Account hinzufügen → Andere → Kalenderabo hinzufügen → diese Adresse einfügen.
          </li>
        </ul>
        <Hint className="mt-0">
          Das Gerät muss die Adresse erreichen können: zu Hause im WLAN oder unterwegs über Tailscale.
          {!appUrl && ' Ohne eingetragene App-Adresse steht hier die Adresse, mit der diese Seite gerade geöffnet ist.'}
        </Hint>
      </div>
    </>
  )
}
