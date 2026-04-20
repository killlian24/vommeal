import { NextRequest, NextResponse } from 'next/server'
import { deleteNomination } from '@/lib/db'

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  deleteNomination(id)
  return NextResponse.json({ ok: true })
}
