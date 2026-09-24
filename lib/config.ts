import { getSetting } from './db'

export type MealieConfig = {
  baseUrl: string
  apiToken: string
}

export type HomeAssistantConfig = {
  baseUrl: string
  token: string
  entity: string
}

// Hosts that are almost always served over plain http on a home network.
// Everything else (public domains) defaults to https.
const PRIVATE_HOST_RE = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|[^./]+\.(local|lan|home|internal))(:\d+)?$/i

export function sanitizeUrl(raw: string): string {
  raw = raw.trim()
  raw = raw.replace(/^https?:https?:\/\//, 'https://')
  if (raw && !/^https?:\/\//i.test(raw)) {
    const host = raw.split('/')[0]
    raw = (PRIVATE_HOST_RE.test(host) ? 'http://' : 'https://') + raw
  }
  return raw.replace(/\/+$/, '')
}

function env(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function configValue(envName: string, settingKey: string): string {
  return env(envName) || getSetting(settingKey) || ''
}

export function getMealieConfig(): MealieConfig | null {
  const baseUrl = sanitizeUrl(configValue('MEALIE_URL', 'mealie_url'))
  const apiToken = configValue('MEALIE_TOKEN', 'mealie_token')
  if (!baseUrl || !apiToken) return null
  return { baseUrl, apiToken }
}

export function getHomeAssistantConfig(): HomeAssistantConfig | null {
  const baseUrl = sanitizeUrl(configValue('HA_URL', 'ha_url'))
  const token = configValue('HA_TOKEN', 'ha_token')
  const entity = configValue('HA_ENTITY', 'ha_entity')
  if (!baseUrl || !token || !entity) return null
  return { baseUrl, token, entity }
}

export function getConfigSourceFlags() {
  return {
    mealie_url: !!env('MEALIE_URL'),
    mealie_token: !!env('MEALIE_TOKEN'),
    ha_url: !!env('HA_URL'),
    ha_token: !!env('HA_TOKEN'),
    ha_entity: !!env('HA_ENTITY'),
  }
}

// --- Time zone ---

export const DEFAULT_TIMEZONE = 'Europe/Copenhagen'

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The household time zone from settings (falls back to Europe/Copenhagen). */
export function getTimezone(): string {
  const tz = getSetting('timezone') || ''
  return tz && isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE
}

export type ZonedParts = {
  /** YYYY-MM-DD */
  date: string
  /** HH:MM (24 h) */
  time: string
  /** 0 = Sunday … 6 = Saturday */
  weekday: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Wall-clock date/time of `now` in `tz`, via Intl (independent of the server's local zone). */
export function zonedParts(now: Date, tz: string): ZonedParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(now).map(p => [p.type, p.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: WEEKDAYS.indexOf(parts.weekday),
  }
}

/** Today's date (YYYY-MM-DD) in the household time zone. */
export function todayInTimezone(now = new Date(), tz = getTimezone()): string {
  return zonedParts(now, tz).date
}

// --- Notification / scheduler settings ---

/** Home Assistant URL + token only (notifications do not need the todo entity). */
export function getHomeAssistantConnection(): { baseUrl: string; token: string } | null {
  const baseUrl = sanitizeUrl(configValue('HA_URL', 'ha_url'))
  const token = configValue('HA_TOKEN', 'ha_token')
  if (!baseUrl || !token) return null
  return { baseUrl, token }
}

/** Defaults for the string-valued settings added with notifications. */
export const SETTING_DEFAULTS = {
  notify_services: '[]',
  notify_weekly_enabled: '1',
  notify_weekly_day: '0',
  notify_weekly_time: '18:00',
  notify_daily_enabled: '0',
  notify_daily_time: '16:00',
  app_public_url: '',
  timezone: DEFAULT_TIMEZONE,
  mealie_nightly_sync: '1',
} as const

export type DefaultedSettingKey = keyof typeof SETTING_DEFAULTS
export const DEFAULTED_SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as DefaultedSettingKey[]

export function getSettingWithDefault(key: DefaultedSettingKey): string {
  return getSetting(key) ?? SETTING_DEFAULTS[key]
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const NOTIFY_SERVICE_RE = /^notify\.[a-z0-9_]{1,100}$/

/**
 * Validate (and normalize) a value for one of the defaulted settings.
 * Returns the value to store, or throws an Error with a German message.
 */
export function normalizeSettingValue(key: DefaultedSettingKey, raw: string): string {
  const value = raw.trim()
  switch (key) {
    case 'notify_weekly_enabled':
    case 'notify_daily_enabled':
    case 'mealie_nightly_sync':
      if (value !== '0' && value !== '1') throw new Error(`${key} muss '0' oder '1' sein`)
      return value
    case 'notify_weekly_day':
      if (!/^[0-6]$/.test(value)) throw new Error('notify_weekly_day muss 0 (Sonntag) bis 6 (Samstag) sein')
      return value
    case 'notify_weekly_time':
    case 'notify_daily_time':
      if (!TIME_RE.test(value)) throw new Error(`${key} muss im Format HH:MM sein`)
      return value
    case 'timezone':
      if (!value || !isValidTimezone(value)) throw new Error('Unbekannte Zeitzone')
      return value
    case 'app_public_url': {
      if (!value) return ''
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) {
        throw new Error('App-Adresse muss eine gültige http(s)-Adresse sein')
      }
      const url = sanitizeUrl(value)
      try {
        const u = new URL(url)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error()
      } catch {
        throw new Error('App-Adresse muss eine gültige http(s)-Adresse sein')
      }
      if (url.length > 2048) throw new Error('App-Adresse ist zu lang')
      return url
    }
    case 'notify_services': {
      let parsed: unknown
      try { parsed = JSON.parse(value || '[]') } catch { throw new Error('notify_services muss ein JSON-Array sein') }
      if (!Array.isArray(parsed) || parsed.length > 50 || !parsed.every(s => typeof s === 'string' && NOTIFY_SERVICE_RE.test(s))) {
        throw new Error("notify_services muss eine Liste wie [\"notify.mobile_app_…\"] sein")
      }
      return JSON.stringify(Array.from(new Set(parsed as string[])))
    }
  }
}

/** Configured notify services (e.g. ['notify.mobile_app_pixel']). */
export function getNotifyServices(): string[] {
  try {
    const parsed = JSON.parse(getSettingWithDefault('notify_services'))
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string' && NOTIFY_SERVICE_RE.test(s)) : []
  } catch {
    return []
  }
}
