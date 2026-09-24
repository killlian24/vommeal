import { NextRequest, NextResponse } from 'next/server'
import { getAllPantryStaples, addPantryStaple } from '@/lib/db'
import { LIMITS } from '@/lib/validate'
import { randomUUID } from 'crypto'

export async function GET() {
  return NextResponse.json(getAllPantryStaples())
}

// Add a pantry staple ("Vorrat"). Adding a name that already exists (any case) returns the
// existing staple, so "Immer da" can be tapped twice without harm.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Ungültige Anfrage (kein JSON)' }, { status: 400 })
  }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Name fehlt' }, { status: 400 })
  if (name.length > LIMITS.name) return NextResponse.json({ error: 'Name ist zu lang' }, { status: 400 })
  const existing = getAllPantryStaples().find(s => s.name.toLowerCase().trim() === name.toLowerCase())
  if (existing) return NextResponse.json(existing, { status: 200 })
  const staple = addPantryStaple(randomUUID(), name)
  return NextResponse.json(staple, { status: 201 })
}
