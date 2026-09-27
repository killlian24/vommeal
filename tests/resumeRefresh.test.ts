import { describe, it, expect } from 'vitest'
import { shouldRefreshOnResume, RESUME_MIN_INTERVAL_MS } from '../lib/useRefreshOnResume'

describe('shouldRefreshOnResume', () => {
  const t0 = 1_000_000

  it('skips app switches within the interval', () => {
    expect(shouldRefreshOnResume('visible', t0 + 5_000, t0)).toBe(false)
    expect(shouldRefreshOnResume('pageshow', t0 + RESUME_MIN_INTERVAL_MS - 1, t0)).toBe(false)
  })

  it('reloads once the interval has passed', () => {
    expect(shouldRefreshOnResume('visible', t0 + RESUME_MIN_INTERVAL_MS, t0)).toBe(true)
    expect(shouldRefreshOnResume('pageshow', t0 + 60_000, t0)).toBe(true)
  })

  it('always reloads when the connection is back, and on polls', () => {
    expect(shouldRefreshOnResume('online', t0 + 1, t0)).toBe(true)
    expect(shouldRefreshOnResume('poll', t0 + 1, t0)).toBe(true)
  })
})
