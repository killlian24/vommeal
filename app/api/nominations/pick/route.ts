import { NextRequest, NextResponse } from 'next/server'
import { addMealPlanEntry, deleteNominationsForDate, getSetting } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'

// Manually resolve a conflict by picking a specific recipe for a date
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { date, recipe_id } = body
  if (!date || !recipe_id) return NextResponse.json({ error: 'date and recipe_id required' }, { status: 400 })

  const user1 = getSetting('user1_name') || ''
  const user2 = getSetting('user2_name') || ''

  addMealPlanEntry({
    id: uuidv4(), date, meal_type: 'dinner',
    recipe_id, custom_meal_name: null,
    servings: 2, notes: '',
    status: 'approved', suggested_by: user1 && user2 ? `${user1} & ${user2}` : 'Fun mode',
  })
  deleteNominationsForDate(date)

  return NextResponse.json({ ok: true })
}
