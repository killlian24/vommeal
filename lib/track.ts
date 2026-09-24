'use client'

// Fire-and-forget usage events for the local usage log (POST /api/events).
// Never throws and never blocks the UI; failures are ignored on purpose.
export function track(name: string, props: Record<string, unknown> = {}): void {
  try {
    let user = ''
    try { user = localStorage.getItem('vommeal_user') || '' } catch { /* storage unavailable */ }
    const body = JSON.stringify({ name, user, props })
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }))
      return
    }
    fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch { /* ignore */ }
}
