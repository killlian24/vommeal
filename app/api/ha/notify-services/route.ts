import { NextResponse } from 'next/server'
import { listNotifyServices } from '@/lib/notify'

// Devices/services Home Assistant can notify (for the settings picker).
export async function GET() {
  try {
    return NextResponse.json({ services: await listNotifyServices() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) })
  }
}
