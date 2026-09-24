'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import { StatusBox, secondaryButtonClass } from './ui'
import type { AuthedFetch } from './ui'

type EventsSummary = {
  since?: string
  total: number
  byName: Record<string, number>
  byUser: Record<string, number>
  byDay?: Record<string, number>
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; data: EventsSummary }
  | { status: 'auth' }
  | { status: 'error'; error: string }

export const EVENT_LABELS: Record<string, string> = {
  plan_add: 'Abend geplant',
  autofill: 'Woche gefüllt',
  fun_open: 'Swipen geöffnet',
  fun_vote: 'Swipe-Stimmen',
  tonight_suggest_pick: 'Heute-Vorschlag übernommen',
  rating_prompt: 'Bewertet',
  recipe_import: 'Rezept importiert',
  cook_mode_open: 'Kochmodus',
  shopping_review_open: 'Zutaten der Woche geöffnet',
  shopping_send_keep: 'An Keep gesendet',
}

const TOP_N = 10
const numberFormat = new Intl.NumberFormat('de-DE')

function sortedEntries(map: Record<string, number> | undefined) {
  return Object.entries(map ?? {})
    .filter(([, count]) => typeof count === 'number' && count > 0)
    .sort((a, b) => b[1] - a[1])
}

export function UsageSection({ profileNames, authedFetch, softFetch }: {
  profileNames: string[]
  authedFetch: AuthedFetch
  softFetch: (url: string) => Promise<Response>
}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const load = useCallback(async (withPrompt = false) => {
    setState({ status: 'loading' })
    try {
      const url = '/api/events?days=30'
      const res = withPrompt ? await authedFetch(url) : await softFetch(url)
      if (res.status === 401) { setState({ status: 'auth' }); return }
      const data = await res.json().catch(() => null)
      if (!res.ok || !data || typeof data.total !== 'number') {
        setState({ status: 'error', error: typeof data?.error === 'string' ? data.error : `HTTP ${res.status}` })
        return
      }
      setState({ status: 'ok', data })
    } catch (err) {
      setState({ status: 'error', error: err instanceof Error ? err.message : 'Netzwerkfehler' })
    }
  }, [authedFetch, softFetch])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state.status === 'loading') {
    return <p className="text-sm text-[#a8a8a8]">Wird geladen …</p>
  }
  if (state.status === 'auth') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-[#a8a8a8]">Für die Nutzungsdaten wird das Admin-Passwort gebraucht.</p>
        <button type="button" onClick={() => load(true)} className={secondaryButtonClass}>Passwort eingeben</button>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="space-y-2">
        <StatusBox ok={false}>
          Nutzungsdaten konnten nicht geladen werden.
          <span className="block text-xs text-red-300/80 mt-1">{state.error}</span>
        </StatusBox>
        <button type="button" onClick={() => load()} className={secondaryButtonClass}>
          <RefreshCw size={15} /> Erneut versuchen
        </button>
      </div>
    )
  }

  const { data } = state
  const names = sortedEntries(data.byName)
  const users = sortedEntries(data.byUser)
  const activeDays = sortedEntries(data.byDay).length

  if (!data.total || names.length === 0) {
    return <p className="text-sm text-[#a8a8a8]">Noch keine Daten. Sobald ihr Vommeal benutzt, erscheint hier, was ihr am häufigsten macht.</p>
  }

  const top = names.slice(0, TOP_N)
  const rest = names.slice(TOP_N).reduce((sum, [, n]) => sum + n, 0)

  return (
    <>
      <div className="flex items-end gap-6">
        <div>
          <p className="text-3xl font-bold text-white tabular-nums leading-none">{numberFormat.format(data.total)}</p>
          <p className="text-xs text-[#8f8f8f] mt-1.5">Aktionen in 30 Tagen</p>
        </div>
        {activeDays > 0 && (
          <div>
            <p className="text-3xl font-bold text-white tabular-nums leading-none">{activeDays}</p>
            <p className="text-xs text-[#8f8f8f] mt-1.5">aktive Tage</p>
          </div>
        )}
      </div>

      <div>
        <p className="text-[13px] font-medium text-[#c4c4c4] mb-2">Häufigste Aktionen</p>
        <table className="w-full text-sm">
          <tbody>
            {top.map(([name, count]) => (
              <tr key={name} className="border-t border-[#222] first:border-t-0">
                <td className="py-2 pr-3 text-[#e0e0e0]">
                  {EVENT_LABELS[name] ?? <span className="font-mono text-xs text-[#a8a8a8]">{name}</span>}
                </td>
                <td className="py-2 text-right text-white tabular-nums font-medium">{numberFormat.format(count)}</td>
              </tr>
            ))}
            {rest > 0 && (
              <tr className="border-t border-[#222]">
                <td className="py-2 pr-3 text-[#a8a8a8]">Sonstige ({names.length - TOP_N})</td>
                <td className="py-2 text-right text-[#a8a8a8] tabular-nums">{numberFormat.format(rest)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {users.length > 0 && (
        <div>
          <p className="text-[13px] font-medium text-[#c4c4c4] mb-2">Pro Person</p>
          <ul className="space-y-1.5">
            {users.map(([user, count]) => (
              <li key={user || '_'} className="flex items-center gap-3 py-1">
                {user ? (
                  <Avatar name={user} users={profileNames} size="md" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-[#2a2a2a] border border-[#3a3a3a] flex-shrink-0" />
                )}
                <span className="flex-1 text-sm text-[#e0e0e0]">{user || 'Ohne Profil'}</span>
                <span className="text-sm text-white tabular-nums font-medium">{numberFormat.format(count)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" onClick={() => load()} className={secondaryButtonClass}>
        <RefreshCw size={15} /> Aktualisieren
      </button>
    </>
  )
}
