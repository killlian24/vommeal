import { NextResponse } from 'next/server'
import { isMealieConfigured } from '@/lib/mealie'
import { getSetting } from '@/lib/db'

type MealieCategory = { id: string; name: string; slug: string }

function sanitizeUrl(raw: string): string {
  raw = raw.replace(/^https?:https?:\/\//, 'https://')
  if (raw && !raw.startsWith('http')) raw = 'https://' + raw
  return raw.replace(/\/$/, '')
}

export async function GET() {
  if (!isMealieConfigured()) {
    return NextResponse.json({ error: 'Mealie not configured' }, { status: 400 })
  }

  const baseUrl = sanitizeUrl(getSetting('mealie_url') || process.env.MEALIE_URL || '')
  const token = getSetting('mealie_token') || process.env.MEALIE_TOKEN || ''

  try {
    const res = await fetch(`${baseUrl}/api/organizers/categories?page=1&perPage=100`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json({ error: `Mealie returned ${res.status}` }, { status: 500 })
    const data = await res.json()
    const items: MealieCategory[] = data.items ?? []
    return NextResponse.json(items.map(c => ({ id: c.id, name: c.name, slug: c.slug })))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
