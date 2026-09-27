// Timing rules for the toast (components/Toast.tsx), kept free of React so
// they can be tested.

/** Toasts with an action (Rückgängig, Trotzdem ersetzen, …) stay longer. */
export const ACTION_MS = 8000
export const DEFAULT_MS = 4000

export function toastDuration(opts: { duration?: number; action?: unknown }): number {
  return opts.duration ?? (opts.action ? ACTION_MS : DEFAULT_MS)
}

type Clock = {
  now: () => number
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

const realClock: Clock = {
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/**
 * A timeout that can be paused while the toast is pointed at or focused, so
 * nobody loses the undo button while reaching for it.
 */
export class PausableTimer {
  private handle: unknown = null
  private startedAt = 0
  private left: number
  private done = false

  constructor(private readonly onDone: () => void, ms: number, private readonly clock: Clock = realClock) {
    this.left = ms
    this.resume()
  }

  /** Milliseconds still to go (while running: as of now). */
  get remaining(): number {
    return this.handle === null ? this.left : Math.max(0, this.left - (this.clock.now() - this.startedAt))
  }

  get paused(): boolean {
    return this.handle === null && !this.done
  }

  pause() {
    if (this.handle === null || this.done) return
    this.left = this.remaining
    this.clock.clear(this.handle)
    this.handle = null
  }

  resume() {
    if (this.handle !== null || this.done) return
    this.startedAt = this.clock.now()
    this.handle = this.clock.set(() => {
      this.handle = null
      this.done = true
      this.onDone()
    }, this.left)
  }

  cancel() {
    if (this.handle !== null) this.clock.clear(this.handle)
    this.handle = null
    this.done = true
  }
}
