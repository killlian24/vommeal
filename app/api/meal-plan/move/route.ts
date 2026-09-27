import { NextRequest, NextResponse } from 'next/server'
import { moveMealPlanEntry } from '@/lib/db'
import { errorResponse, readJsonObject, requireIsoDate, requireString, optionalString, ValidationError, LIMITS } from '@/lib/validate'

/** POST {id, to, by?}: move an entry to another evening; an entry already there swaps places. */
export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req)
    const id = requireString(body.id, 'id', LIMITS.id)
    const to = requireIsoDate(body.to, 'to')
    const result = moveMealPlanEntry(id, to, optionalString(body.by, 'by', LIMITS.userName))
    if (!result.ok) throw new ValidationError(result.error, result.error === 'Eintrag nicht gefunden' ? 404 : 400)
    return NextResponse.json({ moves: result.moves })
  } catch (e) { return errorResponse(e) }
}
