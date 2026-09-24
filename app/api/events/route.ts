import { NextRequest, NextResponse } from 'next/server'
import { addEvent, getEventStats } from '@/lib/db'
import { LIMITS } from '@/lib/validate'

// Local usage log. Clients post via lib/track.ts (navigator.sendBeacon with a
// JSON Blob, or fetch keepalive), so the body is read as text and parsed
// regardless of its Content-Type.

const MAX_NAME = 40
const MAX_PROPS_BYTES = 2048
const MAX_BODY_BYTES = 8192

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => '')
  if (!text || text.length > MAX_BODY_BYTES) return bad('Ungültiges Ereignis')

  let body: unknown
  try { body = JSON.parse(text) } catch { return bad('Ungültiges JSON') }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('Ungültiges Ereignis')
  const { name, user, props } = body as Record<string, unknown>

  if (typeof name !== 'string' || !name.trim() || name.trim().length > MAX_NAME) {
    return bad(`name ist erforderlich (höchstens ${MAX_NAME} Zeichen)`)
  }
  if (user !== undefined && user !== null && typeof user !== 'string') return bad('user muss ein Text sein')
  const userName = typeof user === 'string' ? user.trim().slice(0, LIMITS.userName) : ''

  let propsJson = '{}'
  if (props !== undefined && props !== null) {
    if (typeof props !== 'object' || Array.isArray(props)) return bad('props muss ein Objekt sein')
    propsJson = JSON.stringify(props)
    if (Buffer.byteLength(propsJson, 'utf8') > MAX_PROPS_BYTES) return bad('props ist zu groß (max. 2 KB)')
  }

  addEvent(name.trim(), userName, propsJson)
  return new NextResponse(null, { status: 204 })
}

export async function GET(req: NextRequest) {
  const raw = Number(new URL(req.url).searchParams.get('days') ?? '30')
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 365) : 30
  return NextResponse.json(getEventStats(days))
}
