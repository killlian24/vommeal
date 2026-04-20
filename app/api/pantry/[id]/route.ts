import { NextRequest, NextResponse } from 'next/server'
import { deletePantryStaple } from '@/lib/db'

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  deletePantryStaple(id)
  return NextResponse.json({ ok: true })
}
