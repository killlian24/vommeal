import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

function adminPassword(): string {
  return process.env.APP_PASSWORD?.trim() ?? ''
}

function candidateToken(req: NextRequest): string {
  const auth = req.headers.get('authorization') ?? ''
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  return req.headers.get('x-vommeal-admin-token')?.trim()
    ?? new URL(req.url).searchParams.get('token')?.trim()
    ?? ''
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  const expected = adminPassword()
  if (!expected) return null

  const actual = candidateToken(req)
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(actual)
  const ok = actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer)

  return ok ? null : NextResponse.json({ error: 'admin password required' }, { status: 401 })
}
