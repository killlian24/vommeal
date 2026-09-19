import { NextRequest, NextResponse } from 'next/server'
import { getAllRecipes, upsertRecipe } from '@/lib/db'
import { errorResponse, readJsonObject, parseRecipeInput } from '@/lib/validate'
import { randomUUID } from 'crypto'

export async function GET() {
  return NextResponse.json(getAllRecipes())
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req)
    // Only known recipe fields are accepted; id/source/mealie_id are set server-side.
    const input = parseRecipeInput(body)
    const recipe = upsertRecipe({ ...input, id: randomUUID(), source: 'local', mealie_id: null })
    return NextResponse.json(recipe, { status: 201 })
  } catch (e) { return errorResponse(e) }
}
