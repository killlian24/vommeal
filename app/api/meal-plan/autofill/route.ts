import { NextRequest, NextResponse } from 'next/server'
import { getMealPlanRange, getAllRecipes, addMealPlanEntry, getSetting } from '@/lib/db'
import { todayInTimezone } from '@/lib/config'
import { errorResponse, readJsonObject, requireIsoDate, requireString, LIMITS } from '@/lib/validate'
import { randomUUID } from 'crypto'
import { addDays, format, eachDayOfInterval, parseISO } from 'date-fns'
import { autofillCandidates, planAutofill } from './plan'

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req)
    if (!body.start || !body.end || !body.suggested_by) {
      return NextResponse.json({ error: 'start, end und suggested_by sind erforderlich' }, { status: 400 })
    }
    const rawStart = requireIsoDate(body.start, 'start')
    const end = requireIsoDate(body.end, 'end')
    const suggested_by = requireString(body.suggested_by, 'suggested_by', LIMITS.userName)

    // Never fill days that are already in the past (household time zone).
    const todayStr = todayInTimezone()
    const start = rawStart < todayStr ? todayStr : rawStart
    if (start > end) {
      return NextResponse.json({ ok: true, filled: 0, message: 'Keine kommenden Tage in diesem Zeitraum' })
    }

    // Any entry fills its day, including quick meals (Reste, Bestellen, …).
    const existing = getMealPlanRange(start, end)
    const filledDates = new Set(existing.map(e => e.date))
    const emptyDates = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) })
      .map(d => format(d, 'yyyy-MM-dd'))
      .filter(d => !filledDates.has(d))

    if (emptyDates.length === 0) {
      return NextResponse.json({ ok: true, filled: 0, message: 'Alle Tage sind schon geplant' })
    }

    // All recipes, filtered by the dinner category when one is configured
    const dinnerCategory = getSetting('dinner_category') || ''
    let recipes = getAllRecipes()
    if (dinnerCategory) {
      recipes = recipes.filter(r =>
        r.tags.some(t => t.toLowerCase() === dinnerCategory.toLowerCase())
      )
      if (recipes.length === 0) {
        return NextResponse.json(
          { error: `Keine Rezepte mit der Kategorie „${dinnerCategory}“ – Kategorie in den Einstellungen ändern oder Rezepte zuordnen` },
          { status: 400 }
        )
      }
    }

    // Rating 1 is always out; rating 2 only while enough others remain.
    const candidates = autofillCandidates(recipes, emptyDates.length)
    if (candidates.length === 0) {
      return NextResponse.json({ error: 'Keine passenden Rezepte zum Auffüllen gefunden' }, { status: 400 })
    }

    // Avoid repeating recipes already used this week or in the previous 14 days
    const lookbackStart = format(addDays(parseISO(start), -14), 'yyyy-MM-dd')
    const recent = getMealPlanRange(lookbackStart, format(addDays(parseISO(start), -1), 'yyyy-MM-dd'))
    const usedRecipeIds = new Set(
      [...existing, ...recent].map(e => e.recipe_id).filter((id): id is string => !!id)
    )

    const plan = planAutofill(emptyDates, candidates, usedRecipeIds)
    for (const { date, recipe } of plan) {
      addMealPlanEntry({
        id: randomUUID(),
        date,
        meal_type: 'dinner',
        recipe_id: recipe.id,
        custom_meal_name: null,
        servings: 2,
        notes: '',
        suggested_by,
        status: 'approved',
      })
    }

    return NextResponse.json({ ok: true, filled: plan.length })
  } catch (e) { return errorResponse(e) }
}
