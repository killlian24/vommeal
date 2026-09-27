'use client'

import { useState } from 'react'
import { Hint, Label, PrimaryButton, StatusBox, responseError } from './ui'
import type { AuthedFetch } from './ui'

export function isValidAppUrl(value: string): boolean {
  if (!value) return true
  if (!/^https?:\/\//i.test(value)) return false
  try { new URL(value); return true } catch { return false }
}

// The address the phones open Vommeal with. One place for it: reminders
// link there, the Home Assistant dashboard loads pictures from it and the
// calendar feed puts it into each evening.
export function AppAddressSection({ initial, authedFetch, onSaved }: {
  initial: string
  authedFetch: AuthedFetch
  onSaved: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const trimmed = value.trim()
  const valid = isValidAppUrl(trimmed)

  const save = async () => {
    setError(''); setSaved(false)
    if (!valid) { document.getElementById('app-public-url')?.focus(); return }
    setSaving(true)
    try {
      const res = await authedFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_public_url: trimmed }),
      })
      if (!res.ok) { setError(await responseError(res)); return }
      onSaved(trimmed)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Keine Verbindung zu Vommeal.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div>
        <Label htmlFor="app-public-url">Adresse, unter der ihr Vommeal öffnet</Label>
        <input
          id="app-public-url"
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={e => { setValue(e.target.value); setError('') }}
          placeholder="https://vommeal.tail1234.ts.net"
          aria-invalid={!valid}
          className={`h-11 ${!valid ? '!border-red-500/70' : ''}`}
        />
        {!valid ? (
          <p className="text-xs text-red-300 mt-1.5">Die Adresse muss mit http:// oder https:// beginnen.</p>
        ) : (
          <Hint>
            Z. B. die Tailscale-Adresse. Gebraucht für Links in den Erinnerungen, Bilder und Links im Home-Assistant-Dashboard und die Rezept-Links im Kalender.
          </Hint>
        )}
      </div>
      {error && <StatusBox ok={false}>{error}</StatusBox>}
      <PrimaryButton onClick={save} disabled={saving || trimmed === initial.trim()} done={saved} label="Speichern" />
    </>
  )
}
