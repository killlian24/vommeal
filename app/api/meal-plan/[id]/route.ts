import { NextRequest, NextResponse } from 'next/server'
import { updateMealPlanEntry, deleteMealPlanEntry } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  updateMealPlanEntry(id, body)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  deleteMealPlanEntry(id)
  return NextResponse.json({ ok: true })
}
