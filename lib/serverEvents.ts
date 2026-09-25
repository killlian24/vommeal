import { addEvent } from './db'

const MAX_PROPS_BYTES = 2048

/**
 * Server-side counterpart of lib/track.ts: write a usage event into the local
 * events table (same shape as POST /api/events). Never throws.
 */
export function trackServer(name: string, user: string, props: Record<string, unknown> = {}): void {
  try {
    let json = JSON.stringify(props)
    if (Buffer.byteLength(json, 'utf8') > MAX_PROPS_BYTES) json = '{}'
    addEvent(name.slice(0, 40), user.slice(0, 60), json)
  } catch (e) {
    console.error(`[events] ${name}: ${String(e)}`)
  }
}
