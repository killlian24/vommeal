import { NextRequest, NextResponse } from 'next/server'
import { getAllPantryStaples, addPantryStaple } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'

export async function GET() {
  return NextResponse.json(getAllPantryStaples())
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const staple = addPantryStaple(uuidv4(), body.name.trim())
  return NextResponse.json(staple, { status: 201 })
}
