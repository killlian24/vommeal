import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, readJsonObject, requireIsoDate, requireString, LIMITS } from '@/lib/validate'
import { autofillRange } from '@/lib/autofill'

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req)
    if (!body.start || !body.end || !body.suggested_by) {
      return NextResponse.json({ error: 'start, end und suggested_by sind erforderlich' }, { status: 400 })
    }
    const start = requireIsoDate(body.start, 'start')
    const end = requireIsoDate(body.end, 'end')
    const suggestedBy = requireString(body.suggested_by, 'suggested_by', LIMITS.userName)

    const result = autofillRange(start, end, suggestedBy)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json(result)
  } catch (e) { return errorResponse(e) }
}
