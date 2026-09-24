import { getHomeAssistantConnection, getNotifyServices, getSettingWithDefault, sanitizeUrl } from './config'
import { describeFetchError } from './mealie'

/**
 * Push notifications through Home Assistant's notify services (the HA
 * companion app registers `notify.mobile_app_<device>` for every phone).
 */

export type NotifyService = { id: string; name: string }
export type NotifyResult = { ok: boolean; sent: number; errors: string[] }

const TIMEOUT_MS = 10000

export const TEST_MESSAGE = 'Vommeal: Testnachricht – Benachrichtigungen funktionieren 👍'

/** Absolute link into the app, or '' when no public app address is configured. */
export function appLink(publicUrl: string, pathAndQuery: string): string {
  const base = sanitizeUrl(publicUrl || '')
  if (!base) return ''
  return `${base}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`
}

/**
 * HA notify service payload. iOS opens `data.url`, Android `data.clickAction`;
 * without a link both are omitted. The tag makes a newer notification of the
 * same job replace the older one on the phone.
 */
export function buildNotifyPayload(message: string, url: string, tag: string) {
  const data: Record<string, string> = { tag }
  if (url) {
    data.url = url
    data.clickAction = url
  }
  return { title: 'Vommeal', message, data }
}

async function haFetch(baseUrl: string, token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

/** notify.* services known to Home Assistant, from GET /api/services. */
export async function listNotifyServices(): Promise<NotifyService[]> {
  const conn = getHomeAssistantConnection()
  if (!conn) throw new Error('Home Assistant ist nicht eingerichtet')
  let res: Response
  try {
    res = await haFetch(conn.baseUrl, conn.token, '/api/services')
  } catch (e) {
    throw new Error(`Home Assistant nicht erreichbar (${describeFetchError(e)})`)
  }
  if (res.status === 401 || res.status === 403) throw new Error('Home Assistant hat den Zugriff verweigert – Token prüfen')
  if (!res.ok) throw new Error(`Home Assistant antwortete mit ${res.status}`)
  const domains = await res.json().catch(() => null) as { domain: string; services: Record<string, unknown> }[] | null
  if (!Array.isArray(domains)) throw new Error('Unerwartete Antwort von Home Assistant')
  const notify = domains.find(d => d.domain === 'notify')
  return Object.keys(notify?.services ?? {})
    // send_message is the entity-based service; it needs an entity_id and is not a device.
    .filter(name => name !== 'send_message')
    .sort((a, b) => Number(b.startsWith('mobile_app_')) - Number(a.startsWith('mobile_app_')) || a.localeCompare(b))
    .map(name => ({ id: `notify.${name}`, name }))
}

/** Send one notification to each service. Never throws. */
export async function sendNotification(
  services: string[],
  message: string,
  url: string,
  tag: string,
): Promise<NotifyResult> {
  const errors: string[] = []
  const conn = getHomeAssistantConnection()
  if (!conn) return { ok: false, sent: 0, errors: ['Home Assistant ist nicht eingerichtet'] }
  if (services.length === 0) return { ok: false, sent: 0, errors: ['Keine Geräte für Benachrichtigungen ausgewählt'] }

  const payload = JSON.stringify(buildNotifyPayload(message, url, tag))
  let sent = 0
  for (const service of services) {
    const name = service.replace(/^notify\./, '')
    if (!/^[a-z0-9_]+$/.test(name)) {
      errors.push(`${service}: ungültiger Dienstname`)
      continue
    }
    try {
      const res = await haFetch(conn.baseUrl, conn.token, `/api/services/notify/${name}`, { method: 'POST', body: payload })
      if (res.ok) {
        sent++
      } else {
        const text = await res.text().catch(() => '')
        errors.push(`${service}: Home Assistant antwortete mit ${res.status}${text ? ` (${text.slice(0, 120)})` : ''}`)
      }
    } catch (e) {
      errors.push(`${service}: nicht erreichbar (${describeFetchError(e)})`)
    }
  }
  return { ok: errors.length === 0 && sent > 0, sent, errors }
}

/** Notify all configured devices; the link path is made absolute with app_public_url. */
export async function notifyConfigured(message: string, pathAndQuery: string, tag: string): Promise<NotifyResult> {
  const url = appLink(getSettingWithDefault('app_public_url'), pathAndQuery)
  return sendNotification(getNotifyServices(), message, url, tag)
}
