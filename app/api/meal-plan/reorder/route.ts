import { NextRequest, NextResponse } from 'next/server'
import { reorderMealPlan } from '@/lib/db'
import {
  errorResponse, readJsonObject, requireIsoDate, requireString, optionalObjectArray, ValidationError, LIMITS,
} from '@/lib/validate'

const MAX_MOVES = 60

/** POST {moves: [{id, date}]}: set several dates at once (used for undo). */
export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req)
    if (!Array.isArray(body.moves) || body.moves.length === 0) throw new ValidationError('moves is required')
    const targets = optionalObjectArray(body.moves, 'moves', MAX_MOVES, (item, i) => ({
      id: requireString(item.id, `moves[${i}].id`, LIMITS.id),
      date: requireIsoDate(item.date, `moves[${i}].date`),
    }))
    const result = reorderMealPlan(targets)
    if (!result.ok) throw new ValidationError(result.error)
    return NextResponse.json({ moves: result.moves })
  } catch (e) { return errorResponse(e) }
}
