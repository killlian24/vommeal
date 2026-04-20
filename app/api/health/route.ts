import { NextResponse } from 'next/server'

// Lightweight healthcheck — no secrets, no DB access, safe to expose.
export async function GET() {
  return NextResponse.json({ ok: true })
}
