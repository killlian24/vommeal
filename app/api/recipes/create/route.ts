import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import {
  createMealieRecipe, fetchMealieRecipeDetail, isMealieConfigured,
  MealieHttpError, MealieUnreachableError,
} from '@/lib/mealie'
import { upsertMealieDetail } from '@/lib/mealieSync'
import { getSetting, upsertRecipe } from '@/lib/db'

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

/** Accepts an array of lines or one multi-line string. */
function lines(value: unknown, maxItems: number, maxLen: number): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split('\n') : []
  return raw
    .filter((v): v is string => typeof v === 'string')
    .map(v => v.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map(v => v.slice(0, maxLen))
}

/**
 * POST /api/recipes/create {name, ingredients?, instructions?}
 * Creates the recipe in Mealie (in the configured dinner category) and stores
 * the local copy; answers 201 with the local recipe. Without Mealie it falls
 * back to a local-only recipe so planning never gets stuck.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return fail('Ungültige Anfrage', 400) }
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return fail('Bitte einen Namen angeben', 400)
  if (name.length > 200) return fail('Der Name ist zu lang', 400)
  const ingredients = lines(body.ingredients, 100, 300)
  const instructions = lines(body.instructions, 60, 4000)
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : ''

  if (!isMealieConfigured()) {
    const recipe = upsertRecipe({
      id: randomUUID(), name, source: 'local', description,
      ingredients: ingredients.map(l => ({ amount: '', unit: '', name: l })),
      instructions: instructions.map(text => ({ text })),
    })
    return NextResponse.json(recipe, { status: 201 })
  }

  let slug: string
  try {
    slug = await createMealieRecipe({
      name, description, ingredients, instructions,
      categoryName: getSetting('dinner_category') || undefined,
    })
  } catch (e) {
    console.error('[recipe create]', String(e))
    if (e instanceof MealieUnreachableError) return fail('Mealie ist gerade nicht erreichbar', 502)
    if (e instanceof MealieHttpError && (e.status === 401 || e.status === 403)) {
      return fail('Mealie hat den Zugriff verweigert – bitte den API-Token prüfen', 502)
    }
    if (e instanceof MealieHttpError && e.status === 409) {
      return fail('Ein Rezept mit diesem Namen gibt es in Mealie schon', 409)
    }
    return fail('Anlegen in Mealie fehlgeschlagen', 502)
  }

  try {
    const recipe = upsertMealieDetail(await fetchMealieRecipeDetail(slug))
    return NextResponse.json(recipe, { status: 201 })
  } catch (e) {
    console.error('[recipe create] detail', String(e))
    return fail('Rezept wurde in Mealie angelegt, konnte aber nicht übernommen werden – bitte Mealie-Sync starten', 502)
  }
}
