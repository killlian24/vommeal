import { describe, it, expect, vi, afterEach } from 'vitest'
import { PausableTimer, toastDuration, ACTION_MS, DEFAULT_MS } from '../lib/toastTimer'

afterEach(() => { vi.useRealTimers() })

describe('toastDuration', () => {
  it('gives toasts with an action (Rückgängig) 8 s, others 4 s', () => {
    expect(toastDuration({})).toBe(DEFAULT_MS)
    expect(toastDuration({ action: { label: 'Rückgängig' } })).toBe(ACTION_MS)
    expect(ACTION_MS).toBe(8000)
    expect(DEFAULT_MS).toBe(4000)
  })

  it('keeps an explicit duration', () => {
    expect(toastDuration({ duration: 6000, action: {} })).toBe(6000)
  })
})

describe('PausableTimer', () => {
  it('fires once after the time is up', () => {
    vi.useFakeTimers()
    const done = vi.fn()
    new PausableTimer(done, 4000)
    vi.advanceTimersByTime(3999)
    expect(done).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(done).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10_000)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('waits while paused and continues with the time that was left', () => {
    vi.useFakeTimers()
    const done = vi.fn()
    const t = new PausableTimer(done, 8000)
    vi.advanceTimersByTime(5000)
    t.pause()
    expect(t.paused).toBe(true)
    expect(t.remaining).toBe(3000)
    vi.advanceTimersByTime(60_000)
    expect(done).not.toHaveBeenCalled()
    t.resume()
    vi.advanceTimersByTime(2999)
    expect(done).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('ignores repeated pause and resume', () => {
    vi.useFakeTimers()
    const done = vi.fn()
    const t = new PausableTimer(done, 1000)
    t.pause(); t.pause()
    t.resume(); t.resume()
    vi.advanceTimersByTime(1000)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('never fires after cancel, not even when resumed', () => {
    vi.useFakeTimers()
    const done = vi.fn()
    const t = new PausableTimer(done, 1000)
    t.pause()
    t.cancel()
    t.resume()
    vi.advanceTimersByTime(5000)
    expect(done).not.toHaveBeenCalled()
    expect(t.paused).toBe(false)
  })
})
