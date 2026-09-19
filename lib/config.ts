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
