import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ACTION_EVENT, HaEventsClient, backoffDelay, websocketUrl } from '../lib/haEvents'
import type { WsLike } from '../lib/haEvents'

class FakeWs implements WsLike {
  static instances: FakeWs[] = []
  readyState = 0
  sent: Record<string, unknown>[] = []
  closed = false
  onopen: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: ((ev: { code?: number; reason?: string }) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  constructor(public url: string) {
    FakeWs.instances.push(this)
  }
  send(data: string) { this.sent.push(JSON.parse(data)) }
  close() { this.closed = true }
  // Test helpers: what Home Assistant would do.
  receive(msg: unknown) { this.onmessage?.({ data: JSON.stringify(msg) }) }
  drop(code = 1006) { this.readyState = 3; this.onclose?.({ code }) }
  handshake() {
    this.readyState = 1
    this.onopen?.({})
    this.receive({ type: 'auth_required', ha_version: '2026.9.0' })
    this.receive({ type: 'auth_ok', ha_version: '2026.9.0' })
    this.receive({ id: 1, type: 'result', success: true, result: null })
  }
}

const last = () => FakeWs.instances[FakeWs.instances.length - 1]

describe('HaEventsClient', () => {
  let actions: string[]
  let logs: string[]
  let conn: { baseUrl: string; token: string } | null
  const make = () => new HaEventsClient({
    getConnection: () => conn,
    onAction: action => { actions.push(action) },
    WebSocketImpl: FakeWs,
    log: line => logs.push(line),
  })

  beforeEach(() => {
    vi.useFakeTimers()
    FakeWs.instances = []
    actions = []
    logs = []
    conn = { baseUrl: 'http://192.0.2.10:8123', token: 'secret-token' }
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('authenticates, subscribes and passes Vommeal actions to the handler', () => {
    const client = make()
    client.start()
    const ws = last()
    expect(ws.url).toBe('ws://192.0.2.10:8123/api/websocket')
    ws.receive({ type: 'auth_required' })
    expect(ws.sent).toEqual([{ type: 'auth', access_token: 'secret-token' }])
    ws.receive({ type: 'auth_ok' })
    expect(ws.sent[1]).toEqual({ id: 1, type: 'subscribe_events', event_type: ACTION_EVENT })
    ws.receive({ id: 1, type: 'result', success: true, result: null })
    expect(client.state).toBe('connected')
    expect(logs).toEqual(['connected to http://192.0.2.10:8123, listening for notification buttons'])

    const event = (action: string, event_type = ACTION_EVENT) => ({ id: 1, type: 'event', event: { event_type, data: { action }, origin: 'REMOTE' } })
    ws.receive(event('VOMMEAL|leftovers|2026-09-25|abc'))
    ws.receive(event('OTHER_APP_ACTION'))
    ws.receive(event('VOMMEAL|x|y|z', 'state_changed'))
    ws.onmessage?.({ data: 'not json' })
    expect(actions).toEqual(['VOMMEAL|leftovers|2026-09-25|abc'])
    client.stop()
  })

  it('reconnects with backoff after the connection drops', () => {
    const client = make()
    client.start()
    last().handshake()
    last().drop()
    expect(client.state).toBe('waiting')
    expect(logs[1]).toMatch(/^disconnected from .* retrying in 5 s$/)
    expect(FakeWs.instances).toHaveLength(1)

    vi.advanceTimersByTime(5000)
    expect(FakeWs.instances).toHaveLength(2)
    last().drop() // HA still down
    expect(logs[2]).toMatch(/could not connect .* retrying in 10 s$/)
    vi.advanceTimersByTime(9999)
    expect(FakeWs.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeWs.instances).toHaveLength(3)

    // A successful connection resets the backoff.
    last().handshake()
    last().drop()
    expect(logs[logs.length - 1]).toMatch(/retrying in 5 s$/)
    client.stop()
  })

  it('caps the backoff at 5 minutes', () => {
    expect([0, 1, 2, 5, 6, 30].map(n => backoffDelay(n))).toEqual([5000, 10000, 20000, 160000, 300000, 300000])
  })

  it('reconnects when a ping gets no answer', () => {
    const client = make()
    client.start()
    last().handshake()
    vi.advanceTimersByTime(30000)
    expect(last().sent[last().sent.length - 1]).toMatchObject({ type: 'ping' })
    const ping = last().sent[last().sent.length - 1] as { id: number }
    last().receive({ id: ping.id, type: 'pong' })
    vi.advanceTimersByTime(30000 + 10000)
    expect(last().closed).toBe(true)
    expect(logs).toContain('no answer to ping, reconnecting')
    vi.advanceTimersByTime(5000)
    expect(FakeWs.instances).toHaveLength(2)
    client.stop()
  })

  it('stops on a rejected token instead of hammering Home Assistant', () => {
    const client = make()
    client.start()
    last().receive({ type: 'auth_required' })
    last().receive({ type: 'auth_invalid', message: 'Invalid access token or password' })
    expect(client.state).toBe('auth_failed')
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(FakeWs.instances).toHaveLength(1)
    // Saving new settings restarts it.
    client.restart()
    expect(FakeWs.instances).toHaveLength(2)
    client.stop()
  })

  it('stays idle without Home Assistant and never throws from the handler', async () => {
    conn = null
    const idle = make()
    idle.start()
    expect(idle.state).toBe('idle')
    expect(FakeWs.instances).toHaveLength(0)

    conn = { baseUrl: 'https://ha.example.com/', token: 't' }
    const client = new HaEventsClient({
      getConnection: () => conn,
      onAction: async () => { throw new Error('boom') },
      WebSocketImpl: FakeWs,
      log: line => logs.push(line),
    })
    client.start()
    expect(last().url).toBe('wss://ha.example.com/api/websocket')
    last().handshake()
    last().receive({ id: 1, type: 'event', event: { event_type: ACTION_EVENT, data: { action: 'VOMMEAL|test||k' } } })
    await vi.runOnlyPendingTimersAsync()
    expect(logs.some(l => l.includes('action handler failed: Error: boom'))).toBe(true)
    client.stop()
  })

  it('a constructor that throws leads to a retry, not a crash', () => {
    let calls = 0
    class Throwing extends FakeWs {
      constructor(url: string) {
        super(url)
        if (++calls === 1) throw new Error('bad url')
      }
    }
    const client = new HaEventsClient({ getConnection: () => conn, onAction: () => {}, WebSocketImpl: Throwing, log: line => logs.push(line) })
    expect(() => client.start()).not.toThrow()
    expect(client.state).toBe('waiting')
    vi.advanceTimersByTime(5000)
    expect(calls).toBe(2)
    client.stop()
  })
})

describe('websocketUrl', () => {
  it('maps http to ws and https to wss', () => {
    expect(websocketUrl('http://192.168.0.16:8123')).toBe('ws://192.168.0.16:8123/api/websocket')
    expect(websocketUrl('https://ha.example.com/')).toBe('wss://ha.example.com/api/websocket')
  })
})
