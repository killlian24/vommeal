import { NextRequest, NextResponse } from 'next/server'
import { getNotifyServices, getTimezone, zonedParts } from '@/lib/config'
import { getRecipients, notifyEach } from '@/lib/notify'
import { NOTIFY_TAGS } from '@/lib/notifyContent'
import { emptyBuilder, emptyEvenings, plannedBuilder, plannedDish, suggestionFor, weeklyBuilder } from '@/lib/notifyJobs'
import { rememberTestServices } from '@/lib/notifyActions'
import { nextWeekDates } from '@/lib/scheduler'
import { getMealPlanRange } from '@/lib/db'

const KINDS = ['daily_planned', 'daily_empty', 'weekly'] as const
type Kind = typeof KINDS[number]

/**
 * Send a sample of one reminder kind (default daily_empty) to the given
 * services (or the configured ones), personalized per device, with its
 * buttons. Test buttons only answer "✓ Der Knopf funktioniert".
 * Body: { services?: string[], kind?: 'daily_planned' | 'daily_empty' | 'weekly' }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown> | null
  let services = getNotifyServices()
  if (body && body.services !== undefined) {
    if (!Array.isArray(body.services) || body.services.length > 50 || !body.services.every(s => typeof s === 'string' && /^notify\.[a-z0-9_]{1,100}$/.test(s))) {
      return NextResponse.json({ ok: false, sent: 0, errors: ['services muss eine Liste von notify.*-Diensten sein'] }, { status: 400 })
    }
    services = body.services as string[]
  }
  let kind: Kind = 'daily_empty'
  if (body && body.kind !== undefined) {
    if (typeof body.kind !== 'string' || !(KINDS as readonly string[]).includes(body.kind)) {
      return NextResponse.json({ ok: false, sent: 0, errors: [`kind muss eines von ${KINDS.join(', ')} sein`] }, { status: 400 })
    }
    kind = body.kind as Kind
  }

  const now = zonedParts(new Date(), getTimezone())
  let build
  if (kind === 'daily_planned') {
    const gericht = plannedDish(getMealPlanRange(now.date, now.date)[0]) || suggestionFor(now.date)?.name || 'Spaghetti Bolognese'
    build = plannedBuilder(gericht).build
  } else if (kind === 'daily_empty') {
    build = emptyBuilder(now.date, { test: true }).build
  } else {
    const monday = nextWeekDates(now.date, now.weekday)[0]
    build = weeklyBuilder(monday, emptyEvenings(monday) || 3, { test: true }).build
  }

  rememberTestServices(services)
  const result = await notifyEach(getRecipients(services), build, NOTIFY_TAGS.test)
  return NextResponse.json(result)
}
