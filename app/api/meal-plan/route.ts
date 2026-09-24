import { NextRequest, NextResponse } from 'next/server'
import { getMealPlanRange, addMealPlanEntry, deleteMealPlanRange, getRecipeById } from '@/lib/db'
import {
  errorResponse, readJsonObject, requireDateRange, requireIsoDate, optionalServings,
  optionalString, optionalNullableString, optionalStatus, ValidationError, LIMITS,
} from '@/lib/validate'
import { randomUUID } from 'crypto'

export async function GET(req: NextRequest) {
  try {
    const { start, end } = requireDateRange(new URL(req.url).searchParams)
    return NextResponse.json(getMealPlanRange(start, end))
  } catch (e) { return errorResponse(e) }
}

export async function DELETE(req: NextRequest) {
  try {
    const { start, end } = requireDateRange(new URL(req.url).searchParams)
    deleteMealPlanRange(start, end)
    return NextResponse.json({ ok: true })
  } catch (e) { return errorResponse(e) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req)

    // Only 'dinner' exists today; accept it explicitly or by default, reject anything else.
    const mealType = optionalString(body.meal_type, 'meal_type', 20, 'dinner')
    if (mealType !== 'dinner') throw new ValidationError("meal_type must be 'dinner'")

    const date = requireIsoDate(body.date)
    const recipeId = optionalNullableString(body.recipe_id, 'recipe_id', LIMITS.id)
    const customMealName = optionalNullableString(body.custom_meal_name, 'custom_meal_name', LIMITS.name)
    if (!recipeId && !customMealName) throw new ValidationError('recipe_id or custom_meal_name required')
    if (recipeId && !getRecipeById(recipeId)) throw new ValidationError('recipe_id does not match a known recipe')

    // Approval is abolished; the status field is still accepted (and
    // validated) for older clients, but every entry is stored as approved.
    optionalStatus(body.status, 'approved')

    const entry = addMealPlanEntry({
      // Clients may pass an id (e.g. to restore an entry after undo); otherwise generate one.
      id: optionalString(body.id, 'id', LIMITS.id) || randomUUID(),
      date,
      meal_type: 'dinner',
      recipe_id: recipeId,
      custom_meal_name: customMealName,
      servings: optionalServings(body.servings, 2),
      notes: optionalString(body.notes, 'notes', LIMITS.notes),
      status: 'approved',
      suggested_by: optionalString(body.suggested_by, 'suggested_by', LIMITS.userName),
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (e) { return errorResponse(e) }
}
