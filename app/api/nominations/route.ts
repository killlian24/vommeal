import { NextRequest, NextResponse } from 'next/server'
import {
  getNominationsForRange, addNomination, addMealPlanEntry,
  deleteNominationsForDate, deleteNominationsOlderThan, getMealPlanRange, getSetting, getAllRecipes
} from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start') || ''
  const end = searchParams.get('end') || ''
  if (!start || !end) return NextResponse.json({ error: 'start and end required' }, { status: 400 })

  // Clean up nominations older than 14 days that never resolved into a meal
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 14)
  deleteNominationsOlderThan(cutoff.toISOString().slice(0, 10))

  return NextResponse.json(getNominationsForRange(start, end))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { date, recipe_id, user_name } = body
  if (!date || !recipe_id || !user_name) {
    return NextResponse.json({ error: 'date, recipe_id, and user_name required' }, { status: 400 })
  }

  const nom = addNomination({ id: uuidv4(), date, recipe_id, user_name })

  // Check if the other person already nominated the same recipe for this day → it's a match!
  const allNoms = getNominationsForRange(date, date)
  const matchingNoms = allNoms.filter(n => n.recipe_id === recipe_id)
  const nominators = new Set(matchingNoms.map(n => n.user_name))

  // Get both user names from settings
  const user1 = getSetting('user1_name') || ''
  const user2 = getSetting('user2_name') || ''
  const bothVoted = user1 && user2 && nominators.has(user1) && nominators.has(user2)

  if (bothVoted) {
    // Check there's no confirmed meal for this day yet
    const existing = getMealPlanRange(date, date)
    if (existing.length === 0) {
      // Auto-confirm: create meal plan entry, delete nominations for this date
      addMealPlanEntry({
        id: uuidv4(),
        date,
        meal_type: 'dinner',
        recipe_id,
        custom_meal_name: null,
        servings: 2,
        notes: '',
        status: 'approved',
        suggested_by: `${user1} & ${user2}`,
      })
      deleteNominationsForDate(date)
      return NextResponse.json({ ok: true, match: true, nomination: nom })
    }
  }

  return NextResponse.json({ ok: true, match: false, nomination: nom })
}
