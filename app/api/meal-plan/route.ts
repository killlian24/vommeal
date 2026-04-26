import { NextRequest, NextResponse } from 'next/server'
import { getMealPlanRange, addMealPlanEntry, deleteMealPlanRange } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start') || ''
  const end = searchParams.get('end') || ''
  if (!start || !end) return NextResponse.json({ error: 'start and end required' }, { status: 400 })
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) return NextResponse.json({ error: 'invalid date range' }, { status: 400 })
  return NextResponse.json(getMealPlanRange(start, end))
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start') || ''
  const end = searchParams.get('end') || ''
  if (!start || !end) return NextResponse.json({ error: 'start and end required' }, { status: 400 })
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) return NextResponse.json({ error: 'invalid date range' }, { status: 400 })
  deleteMealPlanRange(start, end)
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.date || !body.meal_type) {
    return NextResponse.json({ error: 'date and meal_type required' }, { status: 400 })
  }
  if (!DATE_RE.test(body.date) || body.meal_type !== 'dinner') {
    return NextResponse.json({ error: 'invalid meal plan entry' }, { status: 400 })
  }
  const entry = addMealPlanEntry({
    id: body.id || uuidv4(),
    date: body.date,
    meal_type: body.meal_type,
    recipe_id: body.recipe_id || null,
    custom_meal_name: body.custom_meal_name || null,
    servings: body.servings || 2,
    notes: body.notes || '',
    status: body.status || 'suggested',
    suggested_by: body.suggested_by || '',
  })
  return NextResponse.json(entry, { status: 201 })
}
