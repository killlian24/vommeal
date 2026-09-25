import { NextRequest, NextResponse } from 'next/server'
import {
  ensureMealieCategory, fetchMealieRecipeDetail, importMealieRecipeFromUrl, isMealieConfigured,
  MealieHttpError, MealieUnreachableError,
} from '@/lib/mealie'
import { upsertMealieDetail } from '@/lib/mealieSync'
import { LIMITS } from '@/lib/validate'
import { getSetting } from '@/lib/db'

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

/** Accept only absolute http(s) URLs; returns the normalized URL or null. */
function parseRecipeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > LIMITS.url) return null
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname) return null
    return u.toString()
  } catch {
    return null
  }
}

/**
 * POST /api/recipes/import {url}
 * Mealie scrapes the page and creates the recipe; we then pull its detail
 * and store it locally. Answers 201 with the local recipe.
 */
export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return fail('Ungültige Anfrage', 400) }
  const url = parseRecipeUrl((body as Record<string, unknown> | null)?.url)
  if (!url) return fail('Bitte einen gültigen Link (http oder https) angeben', 400)

  if (!isMealieConfigured()) return fail('Mealie ist nicht eingerichtet – bitte zuerst in den Einstellungen verbinden', 400)

  let slug: string
  try {
    slug = await importMealieRecipeFromUrl(url)
  } catch (e) {
    console.error('[recipe import]', String(e))
    if (e instanceof MealieUnreachableError) return fail('Mealie ist gerade nicht erreichbar', 502)
    if (e instanceof MealieHttpError && (e.status === 401 || e.status === 403)) {
      return fail('Mealie hat den Zugriff verweigert – bitte den API-Token prüfen', 502)
    }
    if (e instanceof MealieHttpError && e.status >= 400 && e.status < 500) {
      return fail('Auf dieser Seite wurde kein Rezept gefunden', 400)
    }
    return fail('Import in Mealie fehlgeschlagen', 502)
  }

  // The sync only lists the dinner category; without it the imported recipe
  // would vanish from Vommeal on the next sync.
  const dinnerCategory = getSetting('dinner_category') || ''
  if (dinnerCategory) {
    try { await ensureMealieCategory(slug, dinnerCategory) } catch (e) { console.error('[recipe import] category', String(e)) }
  }

  try {
    const detail = await fetchMealieRecipeDetail(slug)
    const recipe = upsertMealieDetail(detail)
    return NextResponse.json(recipe, { status: 201 })
  } catch (e) {
    console.error('[recipe import] detail', String(e))
    return fail('Rezept wurde in Mealie angelegt, konnte aber nicht übernommen werden – bitte Mealie-Sync starten', 502)
  }
}
