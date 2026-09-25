// Shared by the scheduler (server) and the settings preview (client). Pure, no imports.

export type NotifyKind = 'daily_planned' | 'daily_empty' | 'weekly'

export const NOTIFY_TEXT_KEYS: Record<NotifyKind, string> = {
  daily_planned: 'notify_text_daily_planned',
  daily_empty: 'notify_text_daily_empty',
  weekly: 'notify_text_weekly',
}

export const DEFAULT_NOTIFY_TEXTS: Record<NotifyKind, string> = {
  daily_planned: '{name}, heute gibt es {gericht} 🍽️',
  daily_empty: '{name}: Heute Abend ist noch nichts geplant. Wie wär\'s mit {vorschlag}?',
  weekly: '{name}: Nächste Woche sind noch {anzahl} Abende frei – kurz planen?',
}

export const NOTIFY_KIND_LABELS: Record<NotifyKind, string> = {
  daily_planned: 'Heute – etwas geplant',
  daily_empty: 'Heute – nichts geplant',
  weekly: 'Wochenplanung',
}

/** Placeholders per kind, with a German explanation for the settings UI. */
export const NOTIFY_PLACEHOLDERS: Record<NotifyKind, { key: string; label: string }[]> = {
  daily_planned: [
    { key: 'name', label: 'Name der Person' },
    { key: 'gericht', label: 'Geplantes Gericht' },
  ],
  daily_empty: [
    { key: 'name', label: 'Name der Person' },
    { key: 'vorschlag', label: 'Vorgeschlagenes Rezept' },
  ],
  weekly: [
    { key: 'name', label: 'Name der Person' },
    { key: 'anzahl', label: 'Anzahl freier Abende' },
  ],
}

export const NOTIFY_TEXT_MAX = 200

export type NotifyVars = { name?: string; gericht?: string; vorschlag?: string; anzahl?: number | string }

/**
 * Fill a template. Unknown placeholders stay visible so typos are noticed.
 * An empty {name} is removed together with a following ", " or ": " so
 * "{name}: Heute …" reads "Heute …" when a phone has no person assigned.
 * A sentence mentioning an empty {vorschlag} is dropped ("Wie wär's mit ?").
 */
export function renderNotifyText(template: string, vars: NotifyVars): string {
  let text = (template || '').trim()
  const name = (vars.name ?? '').trim()
  if (!name) {
    // "{name}: Heute …" → "Heute …"; "Hallo {name}! Heute …" → "Hallo! Heute …"
    text = text
      .replace(/^\s*\{name\}\s*[,:!–-]?\s*/, '')
      .replace(/[ \t]*,?[ \t]*\{name\}/g, '')
  }
  const vorschlag = (vars.vorschlag ?? '').trim()
  if (!vorschlag) text = text.replace(/[^.!?]*\{vorschlag\}[^.!?]*[.!?]?/g, '').trim()
  text = text
    .replace(/\{name\}/g, name)
    .replace(/\{gericht\}/g, (vars.gericht ?? '').trim())
    .replace(/\{vorschlag\}/g, vorschlag)
    .replace(/\{anzahl\}/g, vars.anzahl === undefined ? '' : String(vars.anzahl))
    .replace(/\s{2,}/g, ' ')
    // Singular for exactly one evening: "sind noch 1 Abende" → "ist noch 1 Abend"
    .replace(/\bsind noch 1 Abende\b/g, 'ist noch 1 Abend')
    .replace(/(^|\s)1 Abende\b/g, '$11 Abend')
    .trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Template for a kind: the saved text, or the default when empty. */
export function templateFor(kind: NotifyKind, saved: string | null | undefined): string {
  const t = (saved ?? '').trim()
  return t || DEFAULT_NOTIFY_TEXTS[kind]
}
