import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { getDb, getDbPath } from '@/lib/db'
import { requireAdmin } from '@/lib/admin'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req)
  if (unauthorized) return unauthorized

  const db = getDb()
  const dbPath = getDbPath()
  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ error: 'Database not found' }, { status: 404 })
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${dbPath}.${stamp}.backup`

  try {
    await db.backup(backupPath)
    const data = fs.readFileSync(backupPath)

    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Disposition': `attachment; filename="vommeal-${stamp.slice(0, 10)}.db"`,
        'Cache-Control': 'no-store',
      },
    })
  } finally {
    fs.rmSync(backupPath, { force: true })
  }
}
