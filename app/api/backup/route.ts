import { NextResponse } from 'next/server'
import fs from 'fs'
import { getDb, getDbPath } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  getDb()
  const dbPath = getDbPath()
  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ error: 'Database not found' }, { status: 404 })
  }

  const data = fs.readFileSync(dbPath)
  const stamp = new Date().toISOString().slice(0, 10)

  return new NextResponse(data, {
    headers: {
      'Content-Type': 'application/vnd.sqlite3',
      'Content-Disposition': `attachment; filename="vommeal-${stamp}.db"`,
      'Cache-Control': 'no-store',
    },
  })
}
