import { NextRequest, NextResponse } from 'next/server'
import { getDb, updateMealPlanEntry, deleteMealPlanEntry, getRecipeById, MealPlanEntry } from '@/lib/db'
import {
  errorResponse, readJsonObject, requireStatus, requireServings, requireString,
  optionalString, ValidationError, LIMITS,
} from '@/lib/validate'

function mealPlanEntryExists(id: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM meal_plan WHERE id = ?').get(id)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await readJsonObject(req)
    if (!mealPlanEntryExists(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Only known, validated fields reach the DB layer.
    const data: Partial<MealPlanEntry> = {}
    if (body.status !== undefined) data.status = requireStatus(body.status)
    if (body.servings !== undefined) data.servings = requireServings(body.servings)
    if (body.notes !== undefined) data.notes = optionalString(body.notes, 'notes', LIMITS.notes)
    if (body.custom_meal_name !== undefined && body.custom_meal_name !== null) {
      data.custom_meal_name = requireString(body.custom_meal_name, 'custom_meal_name', LIMITS.name)
    }
    if (body.recipe_id !== undefined && body.recipe_id !== null) {
      const recipeId = requireString(body.recipe_id, 'recipe_id', LIMITS.id)
      if (!getRecipeById(recipeId)) throw new ValidationError('recipe_id does not match a known recipe')
      data.recipe_id = recipeId
    }
    if (Object.keys(data).length === 0) throw new ValidationError('No updatable fields provided')

    updateMealPlanEntry(id, data)
    return NextResponse.json({ ok: true })
  } catch (e) { return errorResponse(e) }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  deleteMealPlanEntry(id)
  return NextResponse.json({ ok: true })
}
