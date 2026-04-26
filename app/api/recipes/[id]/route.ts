import { NextRequest, NextResponse } from 'next/server'
import { getRecipeById, upsertRecipe, deleteRecipe, updateRecipeRating } from '@/lib/db'
import { updateMealieRating } from '@/lib/mealie'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const recipe = getRecipeById(id)
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(recipe)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const existing = getRecipeById(id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const recipe = upsertRecipe({ ...existing, ...body, id })
  return NextResponse.json(recipe)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const recipe = getRecipeById(id)
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if ('rating' in body) {
    updateRecipeRating(id, body.rating)
    if (recipe.mealie_slug) {
      try {
        await updateMealieRating(recipe.mealie_slug, body.rating, recipe.mealie_id)
      } catch (e) {
        console.error('[rating sync]', String(e))
        return NextResponse.json({ ...getRecipeById(id), mealie_error: String(e) })
      }
    }
  }

  return NextResponse.json(getRecipeById(id))
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  deleteRecipe(id)
  return NextResponse.json({ ok: true })
}
