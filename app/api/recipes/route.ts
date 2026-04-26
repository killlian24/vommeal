import { NextRequest, NextResponse } from 'next/server'
import { getAllRecipes, upsertRecipe } from '@/lib/db'
import { randomUUID } from 'crypto'

export async function GET() {
  return NextResponse.json(getAllRecipes())
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  const recipe = upsertRecipe({ ...body, id: body.id || randomUUID(), source: body.source || 'local' })
  return NextResponse.json(recipe, { status: 201 })
}
