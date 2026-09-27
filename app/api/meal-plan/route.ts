import { NextRequest, NextResponse } from 'next/server'
import { getMealPlanRange, addMealPlanEntryIfExpected, deleteMealPlanRange, getRecipeById } from '@/lib/db'
import {
  errorResponse, readJsonObject, requireDateRange, requireIsoDate, optionalServings,
  optionalString, optionalNullableString, optionalStatus, optionalBoolean, ValidationError, LIMITS,
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
    // The removed rows let the client offer an undo.
    const removed = deleteMealPlanRange(start, end)
    return NextResponse.json({ ok: true, removed })
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

    // Optional expectation of what is on that evening right now (see
    // addMealPlanEntryIfExpected). Requests without it overwrite as before.
    const expectEmpty = optionalBoolean(body.expect_empty, 'expect_empty')
    const replaceId = optionalNullableString(body.replace_id, 'replace_id', LIMITS.id)

    const result = addMealPlanEntryIfExpected({
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
    }, { expectEmpty, replaceId })
    if (!result.ok) {
      return NextResponse.json({ error: 'Inzwischen ist hier etwas anderes geplant', current: result.current }, { status: 409 })
    }
    return NextResponse.json(result.entry, { status: 201 })
  } catch (e) { return errorResponse(e) }
}
