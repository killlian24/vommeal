import { NextRequest, NextResponse } from 'next/server'
import { getRecipeById, upsertRecipe, deleteRecipe, updateRecipeRating } from '@/lib/db'
import { updateMealieRating } from '@/lib/mealie'
import { errorResponse, readJsonObject, parseRecipeInput, optionalRating } from '@/lib/validate'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const recipe = getRecipeById(id)
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(recipe)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const existing = getRecipeById(id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await readJsonObject(req)
    const input = parseRecipeInput(body)
    // Fields omitted by the client keep their stored values; source and
    // mealie_id are never client-controlled.
    const recipe = upsertRecipe({
      ...existing,
      ...input,
      id,
      source: existing.source,
      mealie_id: existing.mealie_id,
    })
    return NextResponse.json(recipe)
  } catch (e) { return errorResponse(e) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await readJsonObject(req)
    const recipe = getRecipeById(id)
    if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if ('rating' in body) {
      const rating = optionalRating(body.rating)
      updateRecipeRating(id, rating)
      if (recipe.mealie_slug) {
        try {
          await updateMealieRating(recipe.mealie_slug, rating, recipe.mealie_id)
        } catch (e) {
          console.error('[rating sync]', String(e))
          return NextResponse.json({ ...getRecipeById(id), mealie_error: String(e) })
        }
      }
    }

    return NextResponse.json(getRecipeById(id))
  } catch (e) { return errorResponse(e) }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  deleteRecipe(id)
  return NextResponse.json({ ok: true })
}
