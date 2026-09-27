'use client'

import { useEffect } from 'react'

// Registers public/sw.js so the installed app opens without a connection.
// Production only: in `next dev` the chunks change all the time, so any
// worker left over from a production test is removed instead.
// The build stamp in the URL gives every deploy its own cache (see sw.js).
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations()
        .then(regs => regs.forEach(r => r.unregister()))
        .catch(() => {})
      return
    }
    const version = process.env.NEXT_PUBLIC_BUILD_STAMP || 'v1'
    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(version)}`, { scope: '/', updateViaCache: 'none' })
      .catch(() => { /* e.g. plain http in the home network: the app just works online only */ })
  }, [])
  return null
}
