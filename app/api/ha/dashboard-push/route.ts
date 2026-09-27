import { NextResponse } from 'next/server'
import { pushDashboardNow } from '@/lib/haDashboard'

/**
 * POST: send the Home Assistant dashboard sensors right now (button
 * "Jetzt senden" in the settings). Returns { ok, error? }.
 */
export async function POST() {
  const result = await pushDashboardNow({ force: true })
  return NextResponse.json(result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Senden hat nicht geklappt.' })
}
