'use client'

const IMPORT_FALLBACK_ERROR = 'Import hat nicht geklappt. Prüfe den Link oder versuche es später noch einmal.'

/** POST /api/recipes/import; returns the new recipe id or a German error message. */
export async function importRecipe(url: string): Promise<{ id: string } | { error: string }> {
  try {
    const res = await fetch('/api/recipes/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const data = await res.json().catch(() => null)
    if (res.ok && data?.id) return { id: data.id as string }
    return { error: (data && typeof data.error === 'string' && data.error) || IMPORT_FALLBACK_ERROR }
  } catch {
    return { error: 'Vommeal ist gerade nicht erreichbar. Prüfe die Verbindung.' }
  }
}

/**
 * First http(s) URL in a piece of text (shared texts often read
 * "Schau mal: https://… via @app"). Trailing punctuation is dropped.
 */
export function extractFirstUrl(...sources: (string | null | undefined)[]): string | null {
  for (const src of sources) {
    if (!src) continue
    const match = src.match(/https?:\/\/[^\s<>"'„“”]+/i)
    if (match) return match[0].replace(/[.,;:!?)\]}»]+$/, '')
  }
  return null
}
