import { NextResponse } from 'next/server'
import { isMealieConfigured } from '@/lib/mealie'
import { getMealieConfig } from '@/lib/config'

type MealieCategory = { id: string; name: string; slug: string }

export async function GET() {
  if (!isMealieConfigured()) {
    return NextResponse.json({ error: 'Mealie not configured' }, { status: 400 })
  }

  const config = getMealieConfig()
  if (!config) return NextResponse.json({ error: 'Mealie not configured' }, { status: 400 })

  try {
    const res = await fetch(`${config.baseUrl}/api/organizers/categories?page=1&perPage=100`, {
      headers: { Authorization: `Bearer ${config.apiToken}`, Accept: 'application/json' },
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
