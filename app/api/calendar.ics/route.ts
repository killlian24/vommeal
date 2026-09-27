import { getMealPlanRange } from '@/lib/db'
import { getSettingWithDefault, getTimezone, todayInTimezone } from '@/lib/config'
import { buildCalendar, calendarRange } from '@/lib/calendarFeed'

// Always built from the current plan, never prerendered or cached.
export const dynamic = 'force-dynamic'

/**
 * GET /api/calendar.ics: the planned dinners (14 days back, 42 ahead) as an
 * iCalendar feed for Home Assistant's Remote Calendar or a phone's calendar
 * subscription.
 */
export async function GET() {
  const now = new Date()
  const timezone = getTimezone()
  const { start, end } = calendarRange(todayInTimezone(now, timezone))
  const body = buildCalendar({
    entries: getMealPlanRange(start, end),
    appUrl: getSettingWithDefault('app_public_url'),
    timezone,
    now,
  })
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="vommeal.ics"',
      'Cache-Control': 'no-cache',
    },
  })
}
