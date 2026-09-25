'use client'

import { useCallback, useEffect, useState } from 'react'
import { BellRing, RefreshCw, Smartphone } from 'lucide-react'
import { DEFAULT_NOTIFY_TEXTS, NOTIFY_KIND_LABELS, NOTIFY_TEXT_KEYS } from '@/lib/notifyTemplates'
import type { NotifyKind } from '@/lib/notifyTemplates'
import {
  Hint, Label, PrimaryButton, StatusBox, Toggle, responseError, secondaryButtonClass,
} from './ui'
import type { AuthedFetch } from './ui'
import { NOTIFY_KIND_ORDER, NotifyTextCard, NotifyTextsHint } from './NotifyTexts'

export type NotifySettings = {
  notify_services: string
  notify_weekly_enabled: string
  notify_weekly_day: string
  notify_weekly_time: string
  notify_daily_enabled: string
  notify_daily_time: string
  app_public_url: string
  notify_people: string
  notify_text_daily_planned: string
  notify_text_daily_empty: string
  notify_text_weekly: string
}

export type NotifyTextDefaults = Partial<Record<NotifyKind, string>>

type NotifyService = { id: string; name?: string }
type ServiceState =
  | { status: 'loading' }
  | { status: 'ok'; services: NotifyService[] }
  | { status: 'auth' }
  | { status: 'error'; error: string }

type TestResult = { ok: boolean; message: string; details: string[] } | null

// Montag first, as a German calendar reads; values follow JS getDay() (0 = Sonntag).
const WEEKDAYS: { value: string; label: string }[] = [
  { value: '1', label: 'Montag' },
  { value: '2', label: 'Dienstag' },
  { value: '3', label: 'Mittwoch' },
  { value: '4', label: 'Donnerstag' },
  { value: '5', label: 'Freitag' },
  { value: '6', label: 'Samstag' },
  { value: '0', label: 'Sonntag' },
]

const SPECIAL_WORDS: Record<string, string> = {
  iphone: 'iPhone', ipad: 'iPad', ipod: 'iPod', macbook: 'MacBook', imac: 'iMac', ha: 'HA', sm: 'SM',
}

/** 'notify.mobile_app_kilians_iphone' → 'Kilians iPhone', 'notify.mobile_app_sm_s911b' → 'SM S911B'. */
export function friendlyServiceName(id: string): string {
  const words = id
    .replace(/^notify\./, '')
    .replace(/^mobile_app_/, '')
    .split('_')
    .filter(Boolean)
    .map(word => {
      const lower = word.toLowerCase()
      if (SPECIAL_WORDS[lower]) return SPECIAL_WORDS[lower]
      // Model numbers like 's911b' read better in capitals
      if (/\d/.test(word) && /[a-z]/i.test(word)) return word.toUpperCase()
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
  return words.join(' ') || id
}

export function parseServiceList(raw: string | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

/** Parses notify_people ({service id: profile name}); anything malformed counts as empty. */
export function parsePeople(raw: string | undefined): Record<string, string> {
  try {
    const parsed = JSON.parse(raw || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'),
    )
  } catch {
    return {}
  }
}

function foldName(value: string): string {
  return value.toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '')
}

/** 'notify.mobile_app_kilians_iphone' + ['Kilian', 'Susi'] → 'Kilian'. Only a unique match counts. */
export function suggestPerson(serviceId: string, profileNames: string[]): string {
  const device = foldName(serviceId.replace(/^notify\./, '').replace(/^mobile_app_/, ''))
  const matches = profileNames.filter(name => {
    const folded = foldName(name)
    return folded.length >= 2 && device.includes(folded)
  })
  return matches.length === 1 ? matches[0] : ''
}

function isValidAppUrl(value: string): boolean {
  if (!value) return true
  if (!/^https?:\/\//i.test(value)) return false
  try { new URL(value); return true } catch { return false }
}

function describeTestErrors(errors: unknown): string[] {
  if (!errors) return []
  const list = Array.isArray(errors) ? errors : typeof errors === 'object' ? Object.entries(errors as Record<string, unknown>).map(([k, v]) => ({ service: k, error: v })) : [errors]
  return list.map(entry => {
    if (typeof entry === 'string') return entry
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>
      const who = typeof e.service === 'string' ? friendlyServiceName(e.service) : ''
      const what = typeof e.error === 'string' ? e.error : JSON.stringify(e.error ?? e)
      return who ? `${who}: ${what}` : what
    }
    return String(entry)
  })
}

type TextState = Record<NotifyKind, string>

type FormState = {
  selected: string[]
  people: Record<string, string>
  weeklyEnabled: boolean
  weeklyDay: string
  weeklyTime: string
  dailyEnabled: boolean
  dailyTime: string
  appUrl: string
  texts: TextState
}

/** The settings payload for the whole section. A text equal to its default is stored as '' (= default). */
function buildValues(form: FormState, defaults: TextState, profileNames: string[]): NotifySettings {
  const text = (kind: NotifyKind) => {
    const t = form.texts[kind].trim()
    return t === defaults[kind].trim() ? '' : t
  }
  return {
    notify_services: JSON.stringify(form.selected),
    // Only devices that get messages need a person; '' = nobody. The server
    // accepts only current profile names, so a renamed person becomes nobody.
    notify_people: JSON.stringify(Object.fromEntries(form.selected.map(id => {
      const person = form.people[id] ?? ''
      return [id, profileNames.includes(person) ? person : '']
    }))),
    notify_weekly_enabled: form.weeklyEnabled ? '1' : '0',
    notify_weekly_day: form.weeklyDay,
    notify_weekly_time: form.weeklyTime,
    notify_daily_enabled: form.dailyEnabled ? '1' : '0',
    notify_daily_time: form.dailyTime,
    app_public_url: form.appUrl.trim(),
    notify_text_daily_planned: text('daily_planned'),
    notify_text_daily_empty: text('daily_empty'),
    notify_text_weekly: text('weekly'),
  }
}

export function NotificationsSection({
  initial, haConfigured, timezone, profileNames: rawProfileNames, textDefaults, authedFetch, softFetch, onSaved,
}: {
  initial: NotifySettings
  haConfigured: boolean
  timezone?: string
  profileNames: string[]
  textDefaults?: NotifyTextDefaults
  authedFetch: AuthedFetch
  softFetch: (url: string) => Promise<Response>
  onSaved: (values: NotifySettings) => void
}) {
  // Trimmed like the server does when it checks notify_people
  const profileNames = rawProfileNames.map(n => n.trim()).filter(Boolean)
  const defaults: TextState = {
    daily_planned: textDefaults?.daily_planned || DEFAULT_NOTIFY_TEXTS.daily_planned,
    daily_empty: textDefaults?.daily_empty || DEFAULT_NOTIFY_TEXTS.daily_empty,
    weekly: textDefaults?.weekly || DEFAULT_NOTIFY_TEXTS.weekly,
  }
  const initialText = (kind: NotifyKind) => {
    const saved = (initial[NOTIFY_TEXT_KEYS[kind] as keyof NotifySettings] || '').trim()
    return saved === defaults[kind].trim() ? '' : saved
  }

  const [selected, setSelected] = useState<string[]>(() => parseServiceList(initial.notify_services))
  const [people, setPeople] = useState<Record<string, string>>(() => parsePeople(initial.notify_people))
  // Devices whose person was filled in automatically and not saved yet
  const [suggested, setSuggested] = useState<Set<string>>(new Set())
  const [weeklyEnabled, setWeeklyEnabled] = useState(initial.notify_weekly_enabled !== '0')
  const [weeklyDay, setWeeklyDay] = useState(initial.notify_weekly_day || '0')
  const [weeklyTime, setWeeklyTime] = useState(initial.notify_weekly_time || '18:00')
  const [dailyEnabled, setDailyEnabled] = useState(initial.notify_daily_enabled === '1')
  const [dailyTime, setDailyTime] = useState(initial.notify_daily_time || '16:00')
  const [appUrl, setAppUrl] = useState(initial.app_public_url || '')
  const [texts, setTexts] = useState<TextState>(() => ({
    daily_planned: initialText('daily_planned'),
    daily_empty: initialText('daily_empty'),
    weekly: initialText('weekly'),
  }))
  const [services, setServices] = useState<ServiceState>({ status: 'loading' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [testKind, setTestKind] = useState<NotifyKind>('daily_empty')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult>(null)

  const form: FormState = { selected, people, weeklyEnabled, weeklyDay, weeklyTime, dailyEnabled, dailyTime, appUrl, texts }
  const values = buildValues(form, defaults, profileNames)
  const serialized = JSON.stringify(values)
  // What the server has; compared against the form to know about unsaved changes
  // On the first render the form holds exactly what was loaded
  const [savedSnapshot, setSavedSnapshot] = useState(serialized)
  const dirty = serialized !== savedSnapshot

  const loadServices = useCallback(async (withPrompt = false) => {
    setServices({ status: 'loading' })
    try {
      const res = withPrompt
        ? await authedFetch('/api/ha/notify-services')
        : await softFetch('/api/ha/notify-services')
      if (res.status === 401) { setServices({ status: 'auth' }); return }
      const data = await res.json().catch(() => null)
      if (!res.ok || !data || data.error || !Array.isArray(data.services)) {
        setServices({ status: 'error', error: typeof data?.error === 'string' ? data.error : `HTTP ${res.status}` })
        return
      }
      // Phones (mobile_app_*) first, other notify services after them
      const isPhone = (s: NotifyService) => s.id.startsWith('notify.mobile_app_')
      const sorted = [...(data.services as NotifyService[])].sort((a, b) =>
        Number(isPhone(b)) - Number(isPhone(a)) || friendlyServiceName(a.id).localeCompare(friendlyServiceName(b.id), 'de'))
      setServices({ status: 'ok', services: sorted })
    } catch (err) {
      setServices({ status: 'error', error: err instanceof Error ? err.message : 'Netzwerkfehler' })
    }
  }, [authedFetch, softFetch])

  useEffect(() => {
    if (haConfigured) loadServices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [haConfigured])

  // Devices that were already selected before people could be assigned get a
  // suggestion too, marked as unsaved until "Speichern". The server drops
  // "niemand" entries, so only do this while nobody has been assigned at all.
  useEffect(() => {
    if (profileNames.length === 0) return
    if (Object.keys(parsePeople(initial.notify_people)).length > 0) return
    const additions: Record<string, string> = {}
    for (const id of selected) {
      if (people[id] !== undefined) continue
      const guess = suggestPerson(id, profileNames)
      if (guess) additions[id] = guess
    }
    if (Object.keys(additions).length === 0) return
    setPeople(prev => ({ ...additions, ...prev }))
    setSuggested(prev => new Set([...Array.from(prev), ...Object.keys(additions)]))
    // Only once the profile names are known
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileNames.join('|')])

  const toggleService = (id: string) => {
    const ticking = !selected.includes(id)
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
    if (ticking && people[id] === undefined) {
      const guess = suggestPerson(id, profileNames)
      setPeople(prev => ({ ...prev, [id]: guess }))
      if (guess) setSuggested(prev => new Set(prev).add(id))
    }
    setTestResult(null)
  }

  const setPerson = (id: string, name: string) => {
    setPeople(prev => ({ ...prev, [id]: name }))
    setSuggested(prev => { const next = new Set(prev); next.delete(id); return next })
    setTestResult(null)
  }

  const appUrlTrimmed = appUrl.trim()
  const appUrlValid = isValidAppUrl(appUrlTrimmed)

  /** Saves the whole section. Returns true when the server has the current values. */
  const save = async (): Promise<boolean> => {
    setSaveError(''); setSaved(false)
    if (!appUrlValid) {
      // The inline message under the field already explains the problem
      document.getElementById('app-public-url')?.focus()
      return false
    }
    setSaving(true)
    try {
      const res = await authedFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
      })
      if (!res.ok) { setSaveError(await responseError(res)); return false }
      setSavedSnapshot(serialized)
      setSuggested(new Set())
      onSaved(values)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      return true
    } catch {
      setSaveError('Keine Verbindung zu Vommeal.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    setTestResult(null)
    // The server builds the test from the saved people and texts, so save first
    if (dirty && !(await save())) return
    setTesting(true)
    try {
      const res = await authedFetch('/api/ha/notify-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services: selected, kind: testKind }),
      })
      const data = await res.json().catch(() => null)
      const details = describeTestErrors(data?.errors)
      if (res.status === 401) {
        setTestResult({ ok: false, message: 'Admin-Passwort fehlt oder ist falsch.', details: [] })
      } else if (!res.ok || !data) {
        setTestResult({ ok: false, message: typeof data?.error === 'string' ? data.error : 'Testnachricht konnte nicht gesendet werden.', details })
      } else {
        const sent = typeof data.sent === 'number' ? data.sent : 0
        const total = selected.length
        const ok = !!data.ok && sent > 0 && details.length === 0
        let message: string
        if (sent === 0) message = 'Es wurde nichts gesendet.'
        else if (ok) {
          message = `„${NOTIFY_KIND_LABELS[testKind]}“ an ${sent} ${sent === 1 ? 'Gerät' : 'Geräte'} gesendet. Schaut aufs Handy.`
          if (testKind !== 'daily_planned') message += ' Ein Tipp auf einen Knopf antwortet nur mit „✓ Der Knopf funktioniert“.'
        } else message = `Nur an ${sent} von ${total} Geräten gesendet.`
        setTestResult({ ok, message, details })
      }
    } catch {
      setTestResult({ ok: false, message: 'Keine Verbindung zu Vommeal.', details: [] })
    } finally {
      setTesting(false)
    }
  }

  // Selected devices that HA no longer reports stay visible so saving does not drop them silently.
  const knownIds = services.status === 'ok' ? services.services.map(s => s.id) : []
  const missing = services.status === 'ok' ? selected.filter(id => !knownIds.includes(id)) : selected
  const rows: { id: string; missing: boolean }[] = [
    ...(services.status === 'ok' ? services.services.map(s => ({ id: s.id, missing: false })) : []),
    ...missing.map(id => ({ id, missing: true })),
  ]

  // Name used in the text previews: the first person that gets a message
  const previewName = selected.map(id => people[id]).find(Boolean) || profileNames[0] || 'Kilian'

  return (
    <>
      <p className="text-sm leading-relaxed text-[#a8a8a8]">
        Jedes Handy bekommt seine eigene Nachricht mit Namen. Über die Knöpfe in der Nachricht könnt ihr direkt planen, ohne die App zu öffnen.
      </p>

      {/* Devices */}
      <div className="border-t border-[#262626] pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-[#c4c4c4]">Geräte</p>
          {haConfigured && (
            <button
              type="button"
              onClick={() => loadServices()}
              disabled={services.status === 'loading'}
              aria-label="Geräteliste neu laden"
              className="h-10 w-10 -mr-2 flex items-center justify-center rounded-lg text-[#8f8f8f] hover:text-white hover:bg-[#1f1f1f] disabled:opacity-40"
            >
              <RefreshCw size={15} className={services.status === 'loading' ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
        <Hint className="mt-0.5 mb-2">
          Wählt die Handys aus, auf denen die Home-Assistant-App Nachrichten anzeigen soll, und bei „Wer?“, wem das Handy gehört.
        </Hint>

        {!haConfigured && (
          <StatusBox ok={false}>
            Home Assistant ist noch nicht eingerichtet. Tragt oben unter „Home Assistant“ Adresse und Token ein, dann erscheinen hier eure Handys.
          </StatusBox>
        )}
        {haConfigured && services.status === 'loading' && (
          <p className="text-sm text-[#a8a8a8] py-2">Geräte werden aus Home Assistant geladen …</p>
        )}
        {haConfigured && services.status === 'auth' && (
          <div className="space-y-2">
            <p className="text-sm text-[#a8a8a8]">Für die Geräteliste wird das Admin-Passwort gebraucht.</p>
            <button type="button" onClick={() => loadServices(true)} className={secondaryButtonClass}>
              Passwort eingeben
            </button>
          </div>
        )}
        {haConfigured && services.status === 'error' && (
          <StatusBox ok={false}>
            Home Assistant ist gerade nicht erreichbar, deshalb fehlt die Geräteliste. Prüft Adresse und Token oben und versucht es erneut.
            <span className="block text-xs text-red-300/80 mt-1">{services.error}</span>
          </StatusBox>
        )}
        {haConfigured && services.status === 'ok' && services.services.length === 0 && (
          <p className="text-sm text-[#a8a8a8] py-2">
            Keine Handys gefunden. Ist die Home-Assistant-App auf euren Handys angemeldet?
          </p>
        )}

        {rows.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {rows.map(({ id, missing: isMissing }) => {
              const checked = selected.includes(id)
              const name = friendlyServiceName(id)
              const showPicker = checked && profileNames.length > 0
              return (
                <li
                  key={id}
                  className={`flex items-center gap-2 min-h-[48px] pl-3 pr-2 py-1.5 rounded-lg border transition-colors ${
                    checked ? 'bg-primary/10 border-primary/40' : 'bg-[#0f0f0f] border-[#262626] hover:border-[#3a3a3a]'
                  }`}
                >
                  <label className="flex items-center gap-2.5 min-w-0 flex-1 min-h-[40px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleService(id)}
                      className="h-5 w-5 flex-shrink-0 accent-[#f97316] p-0"
                    />
                    <Smartphone size={16} className="hidden sm:block text-[#8f8f8f] flex-shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-white truncate">{name}</span>
                      {!isMissing && showPicker && suggested.has(id) ? (
                        <span className="block text-[11px] leading-tight text-[#a8a8a8]">Vorschlag, noch nicht gespeichert</span>
                      ) : (
                        <span className="block text-[11px] text-[#8f8f8f] truncate">
                          {isMissing ? 'Gerade nicht in Home Assistant gefunden' : id}
                        </span>
                      )}
                    </span>
                  </label>
                  {showPicker && (
                    <label className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[11px] text-[#a8a8a8]">Wer?</span>
                      <select
                        value={profileNames.includes(people[id] ?? '') ? people[id] : ''}
                        onChange={e => setPerson(id, e.target.value)}
                        aria-label={`Wer bekommt die Nachrichten auf ${name}?`}
                        className="h-10 w-[92px] px-2 text-sm"
                      >
                        {profileNames.map(p => <option key={p} value={p}>{p}</option>)}
                        <option value="">niemand</option>
                      </select>
                    </label>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {profileNames.length === 0 && selected.length > 0 && (
          <Hint>Legt oben unter „Profile“ eure Namen an, dann könnt ihr jedem Handy eine Person zuordnen.</Hint>
        )}
      </div>

      {/* Weekly planning reminder */}
      <div className="border-t border-[#262626] pt-4 space-y-3">
        <Toggle
          id="notify-weekly"
          label="Wochenplanung"
          description="Erinnert euch, wenn nächste Woche noch Abende frei sind."
          checked={weeklyEnabled}
          onChange={setWeeklyEnabled}
        />
        {weeklyEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="notify-weekly-day">Tag</Label>
              <select
                id="notify-weekly-day"
                value={weeklyDay}
                onChange={e => setWeeklyDay(e.target.value)}
                className="h-11"
              >
                {WEEKDAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="notify-weekly-time">Uhrzeit</Label>
              <input
                id="notify-weekly-time"
                type="time"
                value={weeklyTime}
                onChange={e => setWeeklyTime(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
        )}
      </div>

      {/* Daily "tonight" reminder */}
      <div className="border-t border-[#262626] pt-4 space-y-3">
        <Toggle
          id="notify-daily"
          label="Heute-Erinnerung"
          description="Schickt am Nachmittag, was es heute gibt."
          checked={dailyEnabled}
          onChange={setDailyEnabled}
        />
        {dailyEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="notify-daily-time">Uhrzeit</Label>
              <input
                id="notify-daily-time"
                type="time"
                value={dailyTime}
                onChange={e => setDailyTime(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
        )}
        {timezone && (weeklyEnabled || dailyEnabled) && (
          <Hint className="mt-0">Alle Uhrzeiten gelten in der Zeitzone {timezone}.</Hint>
        )}
      </div>

      {/* Message texts */}
      <div className="border-t border-[#262626] pt-4">
        <p className="text-[13px] font-medium text-[#c4c4c4]">Texte</p>
        <NotifyTextsHint />
        <div className="space-y-3">
          {NOTIFY_KIND_ORDER.map(kind => (
            <NotifyTextCard
              key={kind}
              kind={kind}
              value={texts[kind]}
              defaultText={defaults[kind]}
              previewName={previewName}
              hasAppUrl={appUrlTrimmed !== '' && appUrlValid}
              onChange={text => { setTexts(prev => ({ ...prev, [kind]: text })); setSaveError('') }}
            />
          ))}
        </div>
      </div>

      {/* Public app URL */}
      <div className="border-t border-[#262626] pt-4">
        <Label htmlFor="app-public-url">App-Adresse</Label>
        <input
          id="app-public-url"
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={appUrl}
          onChange={e => { setAppUrl(e.target.value); setSaveError('') }}
          placeholder="https://vommeal.tail1234.ts.net"
          aria-invalid={!appUrlValid}
          className={`h-11 ${!appUrlValid ? '!border-red-500/70' : ''}`}
        />
        {!appUrlValid ? (
          <p className="text-xs text-red-300 mt-1.5">Die Adresse muss mit http:// oder https:// beginnen.</p>
        ) : (
          <Hint>
            Die Adresse, unter der ihr Vommeal öffnet, z. B. die Tailscale-Adresse. Sonst öffnet ein Tipp auf die Nachricht nichts.
          </Hint>
        )}
      </div>

      {/* Test notification */}
      <div className="border-t border-[#262626] pt-4">
        <Label htmlFor="notify-test-kind">Testnachricht</Label>
        <div className="flex flex-wrap gap-2">
          <select
            id="notify-test-kind"
            value={testKind}
            onChange={e => { setTestKind(e.target.value as NotifyKind); setTestResult(null) }}
            className="h-11 flex-1 min-w-[210px]"
          >
            {NOTIFY_KIND_ORDER.map(kind => <option key={kind} value={kind}>{NOTIFY_KIND_LABELS[kind]}</option>)}
          </select>
          <button
            type="button"
            onClick={sendTest}
            disabled={testing || saving || selected.length === 0}
            title={selected.length === 0 ? 'Erst ein Gerät auswählen' : undefined}
            className={secondaryButtonClass}
          >
            <BellRing size={15} className={testing ? 'animate-pulse' : ''} />
            {testing ? 'Wird gesendet …' : 'Senden'}
          </button>
        </div>
        {selected.length === 0 && haConfigured && services.status === 'ok' && services.services.length > 0 ? (
          <Hint>Wählt mindestens ein Gerät aus, um eine Testnachricht zu senden.</Hint>
        ) : (
          <Hint>
            Geht an die ausgewählten Geräte, mit Namen und Knöpfen zum Ausprobieren.
            {dirty && ' Eure Änderungen werden vorher gespeichert.'}
          </Hint>
        )}
      </div>

      {testResult && (
        <StatusBox ok={testResult.ok}>
          {testResult.message}
          {testResult.details.length > 0 && (
            <ul className="mt-1 text-xs space-y-0.5 opacity-90">
              {testResult.details.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
        </StatusBox>
      )}
      {saveError && <StatusBox ok={false}>{saveError}</StatusBox>}

      <div className="flex flex-wrap items-center gap-3 border-t border-[#262626] pt-4">
        <PrimaryButton onClick={() => { void save() }} disabled={saving} done={saved} label="Speichern" />
        {dirty && !saved && <span className="text-xs text-[#a8a8a8]">Ungespeicherte Änderungen</span>}
      </div>
    </>
  )
}
