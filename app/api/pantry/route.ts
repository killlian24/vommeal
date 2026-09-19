import { NextRequest, NextResponse } from 'next/server'
import { getAllPantryStaples, addPantryStaple } from '@/lib/db'
import { errorResponse, readJsonObject, requireString, LIMITS } from '@/lib/validate'
import { randomUUID } from 'crypto'

export async function GET() {
  return NextResponse.json(getAllPantryStaples())
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req)
    const name = requireString(body.name, 'name', LIMITS.name)
    const staple = addPantryStaple(randomUUID(), name)
    return NextResponse.json(staple, { status: 201 })
  } catch (e) { return errorResponse(e) }
}
