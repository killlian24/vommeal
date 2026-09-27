'use client'

// "Abgleichen": POST /api/ha/sync and describe the outcome in German.
// Used by Einkauf and by the "Zutaten der Woche" sheet.

export type SyncResult = {
  ok: boolean
  imported?: number
  linked?: number
  pushed?: number
  checked?: number
  sorted?: number
  needsCategory?: number
  restored?: number
  error?: string
}

/** Turn a sync result into a short German summary ("2 gesendet, 1 übernommen"). */
export function syncSummary(data: SyncResult & { added?: number }): string {
  const imported = data.imported ?? data.added ?? 0
  return [
    (data.pushed ?? 0) > 0 ? `${data.pushed} gesendet` : '',
    imported > 0 ? `${imported} übernommen` : '',
    (data.linked ?? 0) > 0 ? `${data.linked} verknüpft` : '',
    (data.checked ?? 0) > 0 ? `${data.checked} abgehakt` : '',
    (data.sorted ?? 0) > 0 ? 'Liste sortiert' : '',
    (data.needsCategory ?? 0) > 0 ? `${data.needsCategory} ohne Kategorie` : '',
  ].filter(Boolean).join(', ')
}

export async function runHaSync(): Promise<{ ok: boolean; msg: string; data?: SyncResult }> {
  try {
    const res = await fetch('/api/ha/sync', { method: 'POST' })
    let data: SyncResult & { added?: number } = { ok: false }
    let bodyText = ''
    try {
      bodyText = await res.text()
      data = JSON.parse(bodyText)
    } catch { /* non-JSON error body (e.g. HTML from a proxy) */ }
    if (res.ok && data.ok) return { ok: true, msg: syncSummary(data), data }
    const rawReason = data.error
      ? String(data.error)
      : bodyText.trim() && !/^\s*</.test(bodyText) ? bodyText.trim().slice(0, 160) : `HTTP ${res.status}`
    const reason = rawReason
      .replace(/^Cannot reach Home Assistant:\s*/i, '')
      .replace(/^TypeError:\s*/i, '')
    let msg: string
    if (/not configured/i.test(reason)) msg = 'Home Assistant ist nicht eingerichtet – bitte in den Einstellungen eintragen.'
    else if (res.status === 409 || /already running/i.test(reason)) msg = 'Abgleich läuft gerade schon – gleich nochmal versuchen.'
    else if (res.status === 503 || /fetch failed|ECONN|ENOTFOUND|timeout|unreachable/i.test(reason)) msg = `Home Assistant nicht erreichbar (${reason})`
    else msg = `Abgleich fehlgeschlagen (${reason})`
    return { ok: false, msg }
  } catch {
    return { ok: false, msg: 'Abgleich fehlgeschlagen – bitte Einstellungen prüfen.' }
  }
}
