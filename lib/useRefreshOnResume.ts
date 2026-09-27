'use client'

import { useEffect, useRef } from 'react'

// Reload a page's data when the phone comes back to it: the app returns to
// the foreground, the connection is back, or the page is restored from the
// back/forward cache. Optional polling while the page is visible (Einkauf).

export type ResumeReason = 'visible' | 'online' | 'pageshow' | 'poll'

/** Resume refreshes closer together than this are skipped (not "online" or polls). */
export const RESUME_MIN_INTERVAL_MS = 30_000

/**
 * Whether a resume event should reload now. Coming back online always
 * reloads (and flushes queued changes); switching apps back and forth
 * within the interval does not.
 */
export function shouldRefreshOnResume(reason: ResumeReason, now: number, lastRefresh: number, minInterval = RESUME_MIN_INTERVAL_MS): boolean {
  if (reason === 'online' || reason === 'poll') return true
  return now - lastRefresh >= minInterval
}

export function useRefreshOnResume(
  reload: (reason: ResumeReason) => void,
  opts: { pollMs?: number; minIntervalMs?: number } = {},
) {
  const { pollMs, minIntervalMs = RESUME_MIN_INTERVAL_MS } = opts
  // Latest callback without re-subscribing on every render
  const reloadRef = useRef(reload)
  useEffect(() => { reloadRef.current = reload })

  useEffect(() => {
    // The page just loaded its data itself
    let last = Date.now()
    let timer: ReturnType<typeof setInterval> | null = null

    const run = (reason: ResumeReason) => {
      const now = Date.now()
      if (!shouldRefreshOnResume(reason, now, last, minIntervalMs)) return
      last = now
      reloadRef.current(reason)
    }

    const stopPoll = () => { if (timer) { clearInterval(timer); timer = null } }
    const startPoll = () => {
      if (!pollMs || timer || document.visibilityState !== 'visible') return
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') run('poll')
      }, pollMs)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        run('visible')
        startPoll()
      } else {
        stopPoll()
      }
    }
    const onOnline = () => run('online')
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) run('pageshow') }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    window.addEventListener('pageshow', onPageShow)
    startPoll()
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('pageshow', onPageShow)
      stopPoll()
    }
  }, [pollMs, minIntervalMs])
}
