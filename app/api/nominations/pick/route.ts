import { NextRequest, NextResponse } from 'next/server'
import { addMealPlanEntry, deleteNominationsForDate, getSetting, getRecipeById } from '@/lib/db'
import { errorResponse, readJsonObject, requireIsoDate, requireString, ValidationError, LIMITS } from '@/lib/validate'
import { randomUUID } from 'crypto'

// Manually resolve a conflict by picking a specific recipe for a date
export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req)
    const date = requireIsoDate(body.date)
    const recipe_id = requireString(body.recipe_id, 'recipe_id', LIMITS.id)
    if (!getRecipeById(recipe_id)) throw new ValidationError('recipe_id does not match a known recipe')

    const user1 = getSetting('user1_name') || ''
    const user2 = getSetting('user2_name') || ''

    addMealPlanEntry({
      id: randomUUID(), date, meal_type: 'dinner',
      recipe_id, custom_meal_name: null,
      servings: 2, notes: '',
      status: 'approved', suggested_by: user1 && user2 ? `${user1} & ${user2}` : 'Fun mode',
    })
    deleteNominationsForDate(date)

    return NextResponse.json({ ok: true })
  } catch (e) { return errorResponse(e) }
}
