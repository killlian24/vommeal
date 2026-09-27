// Raw error texts from the server, Mealie or Home Assistant ("Error: Mealie
// not configured", "fetch failed", "HTTP 502") turned into one short German
// sentence for a toast or a hint. German texts from our own API pass through.
// Pure and client-safe; unit-tested in tests/errorText.test.ts.

export type Service = 'mealie' | 'ha'

export type FriendlyError = {
  message: string
  /** The service is not set up: the caller can link to Einstellungen. */
  setup: Service | null
}

const SERVICE_NAME: Record<Service, string> = { mealie: 'Mealie', ha: 'Home Assistant' }

/** Which service a raw text is about, if it says so. */
function serviceOf(raw: string): Service | null {
  if (/mealie/i.test(raw)) return 'mealie'
  if (/home ?assistant|\bHA\b/i.test(raw)) return 'ha'
  return null
}

// Words that give an English (untranslated) message away.
const ENGLISH = /\b(not|failed|error|returned|invalid|cannot|could|unable|unknown|unauthorized|forbidden|timeout|timed out|refused|found|missing|already|running|configured)\b/i
const GERMAN = /[äöüß]|\b(nicht|bitte|konnte|keine?|fehlgeschlagen|ist|wurde|gerade)\b/i

/**
 * One German message per raw error. `service` names the service the call was
 * about when the text itself does not (e.g. "fetch failed" during a Mealie sync).
 */
export function friendlyError(raw: unknown, opts: { service?: Service; fallback?: string } = {}): FriendlyError {
  const fallback = opts.fallback ?? 'Hat nicht geklappt'
  const text = (raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : '')
    .replace(/^(Type)?Error:\s*/i, '')
    .replace(/^Cannot reach Home Assistant:\s*/i, 'Home Assistant unreachable: ')
    .trim()
  if (!text) return { message: fallback, setup: null }

  const service = serviceOf(text) ?? opts.service ?? null
  const name = service ? SERVICE_NAME[service] : 'Der Dienst'

  if (/not configured|nicht eingerichtet/i.test(text)) {
    return { message: `${service ? SERVICE_NAME[service] : 'Das'} ist noch nicht eingerichtet`, setup: service }
  }
  if (/already running|läuft gerade schon/i.test(text)) {
    return { message: 'Abgleich läuft gerade schon, gleich nochmal versuchen', setup: null }
  }
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden|verweigert/i.test(text)) {
    return { message: `${name} hat den Zugriff verweigert, bitte den Token prüfen`, setup: null }
  }
  if (/fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|timeout|timed out|unreachable|aborted|network|nicht erreichbar/i.test(text)) {
    return { message: `${name} ist gerade nicht erreichbar`, setup: null }
  }
  // German texts from our own API are already meant for people
  if (GERMAN.test(text) && !ENGLISH.test(text)) return { message: text, setup: null }
  const status = text.match(/\b(?:HTTP|status|Mealie|HA)\s*(\d{3})\b/i)?.[1]
  if (status) return { message: `${name} antwortet mit Fehler ${status}`, setup: null }
  if (ENGLISH.test(text) || !GERMAN.test(text)) return { message: fallback, setup: null }
  return { message: text, setup: null }
}

/** Just the German text. */
export function germanError(raw: unknown, opts: { service?: Service; fallback?: string } = {}): string {
  return friendlyError(raw, opts).message
}
