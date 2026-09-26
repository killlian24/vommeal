import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { shiftMealPlan } from '@/lib/db'
import { errorResponse, readJsonObject, requireIsoDate, optionalString, ValidationError, LIMITS } from '@/lib/validate'
import { QUICK_MEALS } from '@/lib/quickMeals'

/**
 * POST {from, days: 1 | -1, fill?, suggested_by?}
 * Shifts the evening on `from` and the directly following planned evenings by
 * one day; the first free evening absorbs the shift. `fill` (a quick meal
 * name, only with days = 1) is planned on the freed `from` evening.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req)
    const from = requireIsoDate(body.from, 'from')
    if (body.days !== 1 && body.days !== -1) throw new ValidationError('days must be 1 or -1')
    const days = body.days

    let fill: { id: string; name: string; suggested_by: string } | null = null
    if (body.fill !== undefined && body.fill !== null && body.fill !== '') {
      if (days !== 1) throw new ValidationError('fill ist nur beim Verschieben nach hinten möglich')
      const name = QUICK_MEALS.find(q => q.name === body.fill)?.name
      if (!name) throw new ValidationError(`fill must be one of: ${QUICK_MEALS.map(q => q.name).join(', ')}`)
      fill = { id: randomUUID(), name, suggested_by: optionalString(body.suggested_by, 'suggested_by', LIMITS.userName) }
    }

    const result = shiftMealPlan(from, days, fill)
    if (!result.ok) throw new ValidationError(result.error)
    return NextResponse.json({ moves: result.moves, filled: result.filled })
  } catch (e) { return errorResponse(e) }
}
