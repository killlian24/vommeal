import { NextResponse } from 'next/server'

// Lightweight healthcheck: no secrets, no DB access, safe to expose. Also
// says which build is running (set at build time, see lib/buildInfo.js).
export async function GET() {
  return NextResponse.json({
    ok: true,
    version: process.env.NEXT_PUBLIC_APP_VERSION || '',
    commit: process.env.NEXT_PUBLIC_COMMIT || '',
    buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || '',
  })
}
