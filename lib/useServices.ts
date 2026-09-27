'use client'

import { useEffect, useState } from 'react'

// Which optional services are set up (Mealie, Home Assistant), from
// GET /api/settings. Pages hide or explain what needs them instead of
// failing with a raw error. `null` while unknown: show nothing either way.

export type Services = { mealie: boolean; ha: boolean }

let cached: Services | null = null
let pending: Promise<Services | null> | null = null

function load(): Promise<Services | null> {
  pending ??= fetch('/api/settings')
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('settings'))))
    .then((s: { mealie_configured?: boolean; ha_configured?: boolean }) => {
      cached = { mealie: !!s.mealie_configured, ha: !!s.ha_configured }
      return cached
    })
    .catch(() => null)
    .finally(() => { pending = null })
  return pending
}

export function useServices(): Services | null {
  const [services, setServices] = useState<Services | null>(cached)
  useEffect(() => {
    let alive = true
    // Always asks again: the settings may have changed since the last page
    load().then(s => { if (alive && s) setServices(s) })
    return () => { alive = false }
  }, [])
  return services
}
