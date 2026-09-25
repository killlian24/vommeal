/**
 * Listens to Home Assistant for taps on notification buttons, so no HA
 * automation is needed.
 *
 * Opens HA's WebSocket API (`ws(s)://<ha>/api/websocket`), authenticates with
 * the long-lived token, subscribes to `mobile_app_notification_action` events
 * and hands every action starting with "VOMMEAL|" to lib/notifyActions.ts.
 *
 * - Reconnects with backoff (5 s, 10 s, … up to 5 min) and pings every 30 s;
 *   a missing pong counts as a dropped connection.
 * - A rejected token stops the listener (repeated failed logins could get the
 *   NAS banned by HA's ip_ban); saving the HA settings starts it again.
 * - Never throws; logs one line per connect / disconnect.
 *
 * Started from instrumentation.ts under the same condition as the scheduler
 * (production or VOMMEAL_SCHEDULER=1), and only connects while HA is set up
 * and at least one notify device is selected. POST /api/settings calls
 * refreshHaEvents() so new HA settings take effect without a restart.
 *
 * The client class has no DB imports and takes an injectable WebSocket
 * constructor (tests/haEvents.test.ts uses a fake).
 */

export const ACTION_EVENT = 'mobile_app_notification_action'
const ACTION_PREFIX = 'VOMMEAL|'
const SUBSCRIBE_ID = 1

/** The part of the WHATWG WebSocket we use (Node 22+ has it as a global). */
export interface WsLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onclose: ((ev: { code?: number; reason?: string }) => void) | null
  onerror: ((ev: unknown) => void) | null
}
export type WsCtor = new (url: string) => WsLike

export type HaConnection = { baseUrl: string; token: string }

type Timer = ReturnType<typeof setTimeout>

export type HaEventsOptions = {
  /** Current HA address + token, or null when the listener should stay idle. */
  getConnection: () => HaConnection | null
  onAction: (action: string, data: Record<string, unknown>) => void | Promise<unknown>
  WebSocketImpl?: WsCtor
  log?: (line: string) => void
  minDelayMs?: number
  maxDelayMs?: number
  pingIntervalMs?: number
  pongTimeoutMs?: number
}

export type HaEventsState = 'idle' | 'connecting' | 'connected' | 'waiting' | 'auth_failed' | 'stopped'

/** ws:// or wss:// URL of HA's WebSocket API for an http(s) base URL. */
export function websocketUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  if (/^https:\/\//i.test(base)) return `wss://${base.slice(8)}/api/websocket`
  if (/^http:\/\//i.test(base)) return `ws://${base.slice(7)}/api/websocket`
  return `ws://${base}/api/websocket`
}

/** Reconnect delay after `attempt` failed tries: min, 2·min, 4·min, … capped at max. */
export function backoffDelay(attempt: number, minMs = 5000, maxMs = 300000): number {
  return Math.min(maxMs, minMs * 2 ** Math.min(attempt, 20))
}

function unref(t: Timer) {
  (t as { unref?: () => void }).unref?.()
}

export class HaEventsClient {
  private ws: WsLike | null = null
  private generation = 0
  private attempt = 0
  private nextId = SUBSCRIBE_ID + 1
  private reconnectTimer: Timer | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private pongTimer: Timer | null = null
  private _state: HaEventsState = 'idle'
  private readonly opts: Required<Omit<HaEventsOptions, 'WebSocketImpl'>> & { WebSocketImpl?: WsCtor }

  constructor(opts: HaEventsOptions) {
    this.opts = {
      log: line => console.log(`[ha-events] ${line}`),
      minDelayMs: 5000,
      maxDelayMs: 5 * 60 * 1000,
      pingIntervalMs: 30000,
      pongTimeoutMs: 10000,
      ...opts,
    }
  }

  get state(): HaEventsState {
    return this._state
  }

  /** Connect if configured (no-op while already running). */
  start() {
    if (this._state === 'connecting' || this._state === 'connected' || this._state === 'waiting') return
    this.connect()
  }

  stop() {
    this.teardown()
    this._state = 'stopped'
  }

  /** Drop the connection and start over (new settings, token fixed). */
  restart() {
    const wasActive = this._state !== 'idle'
    this.teardown()
    this.attempt = 0
    this._state = 'idle'
    this.connect()
    if (wasActive && this._state === 'idle') this.opts.log('stopped: Home Assistant or notification devices not set up')
  }

  private teardown() {
    this.generation++
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.stopHeartbeat()
    const ws = this.ws
    this.ws = null
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
      try { ws.close() } catch { /* already closed */ }
    }
  }

  private connect() {
    let conn: HaConnection | null = null
    try { conn = this.opts.getConnection() } catch (e) { this.opts.log(`settings unreadable: ${String(e)}`) }
    if (!conn) {
      this._state = 'idle'
      return
    }
    const Impl = this.opts.WebSocketImpl ?? (globalThis as { WebSocket?: unknown }).WebSocket as WsCtor | undefined
    if (!Impl) {
      this.opts.log('no WebSocket support in this Node version (needs Node 22+), notification buttons are disabled')
      this._state = 'stopped'
      return
    }

    const gen = ++this.generation
    this._state = 'connecting'
    let ws: WsLike
    try {
      ws = new Impl(websocketUrl(conn.baseUrl))
    } catch (e) {
      this.opts.log(`cannot connect to ${conn.baseUrl}: ${String(e)}`)
      this.scheduleReconnect()
      return
    }
    this.ws = ws
    const token = conn.token
    const baseUrl = conn.baseUrl

    ws.onmessage = ev => {
      if (gen !== this.generation) return
      let parsed: unknown
      try { parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)) } catch { return }
      for (const msg of Array.isArray(parsed) ? parsed : [parsed]) {
        if (msg && typeof msg === 'object') this.onMessage(msg as Record<string, unknown>, token, baseUrl)
      }
    }
    ws.onclose = ev => {
      if (gen !== this.generation) return
      this.ws = null
      this.stopHeartbeat()
      if (this._state === 'auth_failed') return
      const wasConnected = this._state === 'connected'
      const delay = this.scheduleReconnect()
      const why = ev?.code ? ` (code ${ev.code}${ev.reason ? `, ${ev.reason}` : ''})` : ''
      this.opts.log(`${wasConnected ? 'disconnected from' : 'could not connect to'} ${baseUrl}${why}, retrying in ${Math.round(delay / 1000)} s`)
    }
    ws.onerror = () => { /* a close event follows */ }
  }

  private send(msg: Record<string, unknown>) {
    try { this.ws?.send(JSON.stringify(msg)) } catch { /* socket closing; onclose reconnects */ }
  }

  private onMessage(msg: Record<string, unknown>, token: string, baseUrl: string) {
    switch (msg.type) {
      case 'auth_required':
        this.send({ type: 'auth', access_token: token })
        return
      case 'auth_ok':
        this.send({ id: SUBSCRIBE_ID, type: 'subscribe_events', event_type: ACTION_EVENT })
        return
      case 'auth_invalid':
        this.opts.log(`Home Assistant rejected the token (${String(msg.message ?? 'auth_invalid')}); notification buttons stay off until the HA settings are saved again`)
        this.teardown()
        this._state = 'auth_failed'
        return
      case 'result':
        if (msg.id !== SUBSCRIBE_ID) return
        if (msg.success) {
          this._state = 'connected'
          this.attempt = 0
          this.startHeartbeat()
          this.opts.log(`connected to ${baseUrl}, listening for notification buttons`)
        } else {
          this.opts.log(`subscribing to ${ACTION_EVENT} failed: ${JSON.stringify(msg.error ?? null)}`)
          try { this.ws?.close() } catch { /* ignore */ }
        }
        return
      case 'pong':
        if (this.pongTimer) clearTimeout(this.pongTimer)
        this.pongTimer = null
        return
      case 'event': {
        const event = msg.event as { event_type?: unknown; data?: unknown } | undefined
        if (event?.event_type !== ACTION_EVENT || !event.data || typeof event.data !== 'object') return
        const data = event.data as Record<string, unknown>
        if (typeof data.action !== 'string' || !data.action.startsWith(ACTION_PREFIX)) return
        try {
          Promise.resolve(this.opts.onAction(data.action, data))
            .catch(e => this.opts.log(`action handler failed: ${String(e)}`))
        } catch (e) {
          this.opts.log(`action handler failed: ${String(e)}`)
        }
        return
      }
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.pingTimer = setInterval(() => {
      if (this.pongTimer) return // still waiting for the last one
      this.send({ id: this.nextId++, type: 'ping' })
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null
        this.opts.log('no answer to ping, reconnecting')
        this.teardown()
        this.scheduleReconnect()
      }, this.opts.pongTimeoutMs)
      unref(this.pongTimer)
    }, this.opts.pingIntervalMs)
    unref(this.pingTimer)
  }

  private stopHeartbeat() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    if (this.pongTimer) clearTimeout(this.pongTimer)
    this.pingTimer = null
    this.pongTimer = null
  }

  private scheduleReconnect(): number {
    const delay = backoffDelay(this.attempt++, this.opts.minDelayMs, this.opts.maxDelayMs)
    this._state = 'waiting'
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
    unref(this.reconnectTimer)
    return delay
  }
}

// ---------------------------------------------------------------------------
// Process-wide listener
// ---------------------------------------------------------------------------

const globalState = globalThis as typeof globalThis & { __vommealHaEvents?: HaEventsClient }

/** Start the listener (instrumentation.ts). Same gate as the scheduler; safe to call twice. */
export async function startHaEvents() {
  if (globalState.__vommealHaEvents) return
  const { schedulerEnabled } = await import('./scheduler')
  if (!schedulerEnabled()) return
  const { getHomeAssistantConnection, getNotifyServices } = await import('./config')
  const client = new HaEventsClient({
    getConnection: () => (getNotifyServices().length > 0 ? getHomeAssistantConnection() : null),
    onAction: async action => {
      const { handleNotificationAction } = await import('./notifyActions')
      await handleNotificationAction(action)
    },
  })
  globalState.__vommealHaEvents = client
  client.start()
  if (client.state === 'idle') console.log('[ha-events] idle: Home Assistant or notification devices not set up')
}

/** Reconnect with the current settings (after HA address, token or devices changed). No-op when not started. */
export function refreshHaEvents() {
  try {
    globalState.__vommealHaEvents?.restart()
  } catch (e) {
    console.error(`[ha-events] restart failed: ${String(e)}`)
  }
}
