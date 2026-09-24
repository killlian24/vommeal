import { NextRequest, NextResponse } from 'next/server'
import { getNotifyServices, getSettingWithDefault } from '@/lib/config'
import { appLink, sendNotification, TEST_MESSAGE } from '@/lib/notify'

// Send a test notification to the given services (or the configured ones).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown> | null
  let services = getNotifyServices()
  if (body && body.services !== undefined) {
    if (!Array.isArray(body.services) || body.services.length > 50 || !body.services.every(s => typeof s === 'string' && /^notify\.[a-z0-9_]{1,100}$/.test(s))) {
      return NextResponse.json({ ok: false, sent: 0, errors: ['services muss eine Liste von notify.*-Diensten sein'] }, { status: 400 })
    }
    services = body.services as string[]
  }
  const url = appLink(getSettingWithDefault('app_public_url'), '/')
  const result = await sendNotification(services, TEST_MESSAGE, url, 'vommeal-test')
  return NextResponse.json(result)
}
