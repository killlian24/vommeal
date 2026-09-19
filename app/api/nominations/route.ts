import { NextRequest, NextResponse } from 'next/server'
import {
  getNominationsForRange, addNomination, addMealPlanEntry,
  deleteNominationsForDate, deleteNominationsOlderThan, deleteNominationsForRange,
  getMealPlanRange, getSetting, getRecipeById
} from '@/lib/db'
import {
  errorResponse, readJsonObject, requireDateRange, requireIsoDate, requireString,
  ValidationError, LIMITS,
} from '@/lib/validate'
import { randomUUID } from 'crypto'

// Clean up nominations older than 14 days that never resolved into a meal.
// Runs at most once per hour (per server process) rather than on every read.
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000
let lastCleanupAt = 0

function cleanupOldNominations() {
  const now = Date.now()
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return
  lastCleanupAt = now
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 14)
  deleteNominationsOlderThan(cutoff.toISOString().slice(0, 10))
}

export async function GET(req: NextRequest) {
  try {
    const { start, end } = requireDateRange(new URL(req.url).searchParams)
    cleanupOldNominations()
    return NextResponse.json(getNominationsForRange(start, end))
  } catch (e) { return errorResponse(e) }
}

export async function DELETE(req: NextRequest) {
  try {
    const { start, end } = requireDateRange(new URL(req.url).searchParams)
    deleteNominationsForRange(start, end)
    return NextResponse.json({ ok: true })
  } catch (e) { return errorResponse(e) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req)
    const date = requireIsoDate(body.date)
    const recipe_id = requireString(body.recipe_id, 'recipe_id', LIMITS.id)
    const user_name = requireString(body.user_name, 'user_name', LIMITS.userName)
    if (!getRecipeById(recipe_id)) throw new ValidationError('recipe_id does not match a known recipe')

    const nom = addNomination({ id: randomUUID(), date, recipe_id, user_name })

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
          id: randomUUID(),
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
  } catch (e) { return errorResponse(e) }
}
