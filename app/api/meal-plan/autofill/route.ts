import { NextRequest, NextResponse } from 'next/server'
import { getMealPlanRange, getAllRecipes, addMealPlanEntry, getSetting } from '@/lib/db'
import { randomUUID } from 'crypto'
import { addDays, format, eachDayOfInterval, parseISO } from 'date-fns'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { start: rawStart, end, suggested_by } = body
  if (!rawStart || !end || !suggested_by) {
    return NextResponse.json({ error: 'start, end, and suggested_by required' }, { status: 400 })
  }

  // Never fill days that are already in the past
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const start = rawStart < todayStr ? todayStr : rawStart
  if (start > end) {
    return NextResponse.json({ ok: true, filled: 0, message: 'No upcoming days in this range' })
  }

  // Find which days in the range are empty
  const existing = getMealPlanRange(start, end)
  const filledDates = new Set(existing.map(e => e.date))
  const allDays = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) })
  const emptyDays = allDays.filter(d => !filledDates.has(format(d, 'yyyy-MM-dd')))

  if (emptyDays.length === 0) {
    return NextResponse.json({ ok: true, filled: 0, message: 'All days already have a meal' })
  }

  // Get all recipes, filtered by dinner category when one is configured
  const dinnerCategory = getSetting('dinner_category') || ''
  let recipes = getAllRecipes()
  if (dinnerCategory) {
    recipes = recipes.filter(r =>
      r.tags.some(t => t.toLowerCase() === dinnerCategory.toLowerCase())
    )
    if (recipes.length === 0) {
      return NextResponse.json(
        { error: `No recipes tagged "${dinnerCategory}" — change the dinner category in Settings or tag some recipes` },
        { status: 400 }
      )
    }
  }

  if (recipes.length === 0) {
    return NextResponse.json({ error: 'No recipes found to fill with' }, { status: 400 })
  }

  // Skip recipes rated 1 or 2 stars, as long as enough other recipes remain
  const lowRated = recipes.filter(r => r.rating !== null && r.rating <= 2)
  if (lowRated.length > 0 && recipes.length - lowRated.length >= emptyDays.length) {
    recipes = recipes.filter(r => r.rating === null || r.rating > 2)
  }

  // Avoid repeating recipes already used this week or in the previous 14 days
  const lookbackStart = format(addDays(parseISO(start), -14), 'yyyy-MM-dd')
  const recent = getMealPlanRange(lookbackStart, format(addDays(parseISO(start), -1), 'yyyy-MM-dd'))
  const usedRecipeIds = new Set([...existing, ...recent].map(e => e.recipe_id).filter(Boolean))

  // Shuffle recipes, preferring unused ones
  const unused = recipes.filter(r => !usedRecipeIds.has(r.id))
  const pool = unused.length >= emptyDays.length
    ? unused
    : [...unused, ...recipes.filter(r => usedRecipeIds.has(r.id))]

  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }

  // Fill empty days
  const filled = []
  for (let i = 0; i < emptyDays.length; i++) {
    const recipe = pool[i % pool.length]
    const entry = addMealPlanEntry({
      id: randomUUID(),
      date: format(emptyDays[i], 'yyyy-MM-dd'),
      meal_type: 'dinner',
      recipe_id: recipe.id,
      custom_meal_name: null,
      servings: 2,
      notes: '',
      suggested_by,
      status: 'suggested',
    })
    filled.push(entry)
  }

  return NextResponse.json({ ok: true, filled: filled.length })
}
