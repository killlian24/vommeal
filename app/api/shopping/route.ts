import { NextRequest, NextResponse } from 'next/server'
import {
  getAllShoppingItems, addShoppingItem, clearCheckedItems, clearAllItems,
  getAllRecipes, getMealPlanRange, setShoppingItemHaUid,
  getAllPantryStaples, PantryStaple,
} from '@/lib/db'
import { getHomeAssistantConfig } from '@/lib/config'
import { categorize } from '@/lib/categorize'
import { v4 as uuidv4 } from 'uuid'

type HATodoItem = { summary: string; uid: string; status: string }

// Bilingual alias pairs — each entry maps a name to its counterpart(s)
// Used only for staple matching, does not affect categorisation
const STAPLE_ALIASES: Record<string, string[]> = {
  // Basics
  'salz': ['salt'],                         'salt': ['salz'],
  'pfeffer': ['pepper', 'black pepper'],    'pepper': ['pfeffer'], 'black pepper': ['pfeffer'],
  'zucker': ['sugar'],                      'sugar': ['zucker'],
  'mehl': ['flour'],                        'flour': ['mehl'],
  'butter': ['butter'],
  // Oils & vinegar
  'öl': ['oil'],                            'oil': ['öl'],
  'olivenöl': ['olive oil'],               'olive oil': ['olivenöl'],
  'sonnenblumenöl': ['sunflower oil'],     'sunflower oil': ['sonnenblumenöl'],
  'rapsöl': ['canola oil', 'rapeseed oil'],
  'essig': ['vinegar'],                     'vinegar': ['essig'],
  'balsamico': ['balsamic vinegar'],        'balsamic vinegar': ['balsamico'],
  // Alliums
  'knoblauch': ['garlic'],                  'garlic': ['knoblauch'],
  'zwiebel': ['onion', 'onions'],
  'zwiebeln': ['onion', 'onions'],         'onion': ['zwiebel', 'zwiebeln'], 'onions': ['zwiebel', 'zwiebeln'],
  // Dairy & eggs
  'milch': ['milk'],                        'milk': ['milch'],
  'ei': ['egg', 'eggs'],
  'eier': ['egg', 'eggs'],                 'egg': ['ei', 'eier'], 'eggs': ['ei', 'eier'],
  'sahne': ['cream', 'heavy cream'],       'cream': ['sahne'], 'heavy cream': ['sahne'],
  // Sweeteners
  'honig': ['honey'],                       'honey': ['honig'],
  'ahornsirup': ['maple syrup'],            'maple syrup': ['ahornsirup'],
  // Sauces & pastes
  'tomatenmark': ['tomato paste', 'tomato puree'],
  'tomato paste': ['tomatenmark'],          'tomato puree': ['tomatenmark'],
  'sojasoße': ['soy sauce', 'soya sauce'], 'soy sauce': ['sojasoße'], 'soya sauce': ['sojasoße'],
  'senf': ['mustard'],                      'mustard': ['senf'],
  // Stocks & broth
  'brühe': ['broth', 'stock', 'bouillon'],
  'gemüsebrühe': ['vegetable broth', 'vegetable stock'],
  'hühnerbrühe': ['chicken broth', 'chicken stock'],
  'broth': ['brühe'],                       'stock': ['brühe'],
  // Baking
  'backpulver': ['baking powder'],          'baking powder': ['backpulver'],
  'natron': ['baking soda'],                'baking soda': ['natron'],
  'hefe': ['yeast'],                        'yeast': ['hefe'],
  'vanille': ['vanilla'],                   'vanilla': ['vanille'],
  // Grains & pasta
  'reis': ['rice'],                         'rice': ['reis'],
  'nudeln': ['pasta', 'noodles'],          'pasta': ['nudeln'], 'noodles': ['nudeln'],
  // Spices
  'paprikapulver': ['paprika', 'paprika powder'],
  'kreuzkümmel': ['cumin'],                 'cumin': ['kreuzkümmel'],
  'zimt': ['cinnamon'],                     'cinnamon': ['zimt'],
  'kurkuma': ['turmeric'],                  'turmeric': ['kurkuma'],
  'oregano': ['oregano'],
  'muskat': ['nutmeg'],                     'nutmeg': ['muskat'],
  'chili': ['chili', 'chilli', 'chili flakes', 'chilli flakes'],
  // Citrus
  'zitronensaft': ['lemon juice'],          'lemon juice': ['zitronensaft'],
  'zitronenabrieb': ['lemon zest'],         'lemon zest': ['zitronenabrieb'],
  // Nuts & seeds
  'sesam': ['sesame', 'sesame seeds'],     'sesame': ['sesam'],
  'mandeln': ['almonds'],                   'almonds': ['mandeln'],
}

// Always skipped regardless of pantry settings — nobody shops for these
const ALWAYS_SKIP = new Set([
  'water', 'wasser', 'sparkling water', 'mineralwasser', 'tap water', 'leitungswasser',
  'salt', 'salz', 'sea salt', 'meersalz', 'table salt', 'kosher salt',
  'pepper', 'pfeffer', 'black pepper', 'schwarzer pfeffer', 'white pepper', 'weißer pfeffer',
])

/** Expand a set of staple names to include all bilingual aliases */
function buildStapleSet(staples: PantryStaple[]): Set<string> {
  const result = new Set<string>()
  for (const s of staples) {
    const key = s.name.toLowerCase().trim()
    result.add(key)
    for (const alias of (STAPLE_ALIASES[key] ?? [])) {
      result.add(alias.toLowerCase().trim())
    }
  }
  return result
}

async function pushToHAAndTrack(items: { localId: string; name: string }[]) {
  const config = getHomeAssistantConfig()
  if (!config || items.length === 0) return
  const { baseUrl: haUrl, token, entity } = config

  // Push all items
  await Promise.allSettled(items.map(({ name }) =>
    fetch(`${haUrl}/api/services/todo/add_item`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: entity, item: name }),
    })
  ))

  // Fetch back needs_action items to find uids for what we just added
  try {
    const res = await fetch(`${haUrl}/api/services/todo/get_items?return_response`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: entity, status: ['needs_action'] }),
    })
    if (!res.ok) return
    const data = await res.json()
    const haItems: HATodoItem[] = data?.service_response?.[entity]?.items ?? []
    const haByName = new Map(haItems.map(i => [i.summary?.toLowerCase().trim(), i.uid]))

    for (const { localId, name } of items) {
      const uid = haByName.get(name.toLowerCase().trim())
      if (uid) setShoppingItemHaUid(localId, uid)
    }
  } catch { /* best-effort uid tracking */ }
}

export async function GET() {
  return NextResponse.json(getAllShoppingItems())
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Bulk generate from meal plan date range
  if (body.action === 'generate') {
    const { start, end } = body
    if (!start || !end) return NextResponse.json({ error: 'start and end required' }, { status: 400 })

    const entries = getMealPlanRange(start, end)
    const recipes = getAllRecipes()
    const recipeMap = new Map(recipes.map(r => [r.id, r]))

    // Skip meal plan entries whose ingredients are already in the list
    const existing = getAllShoppingItems()
    const alreadyAddedPlanIds = new Set(existing.map(i => i.meal_plan_id).filter(Boolean))

    // Skip pantry staples (bilingual-aware)
    const stapleNames = buildStapleSet(getAllPantryStaples())

    const items: ReturnType<typeof addShoppingItem>[] = []
    for (const entry of entries) {
      if (!entry.recipe_id) continue
      if (alreadyAddedPlanIds.has(entry.id)) continue  // already generated for this day
      const recipe = recipeMap.get(entry.recipe_id)
      if (!recipe) continue

      const scale = entry.servings / (recipe.servings || 1)
      for (const ing of recipe.ingredients) {
        if (!ing.name) continue
        if (ALWAYS_SKIP.has(ing.name.toLowerCase().trim())) continue
        if (stapleNames.has(ing.name.toLowerCase().trim())) continue
        const scaledAmount = ing.amount
          ? (parseFloat(ing.amount) * scale || ing.amount).toString()
          : ''
        items.push(addShoppingItem({
          id: uuidv4(),
          name: ing.name,
          amount: scaledAmount,
          unit: ing.unit,
          category: categorize(ing.name),
          checked: false,
          source: 'meal_plan',
          meal_plan_id: entry.id,
          ha_uid: null,
          sort_order: items.length,
        }))
      }
    }
    // Don't push to HA here — let the user review and check off what they have,
    // then the Sync button will push remaining unchecked items to HA.
    return NextResponse.json({ ok: true, added: items.length })
  }

  if (body.action === 'clear_checked') {
    clearCheckedItems()
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'clear_all') {
    clearAllItems()
    return NextResponse.json({ ok: true })
  }

  // Add ingredients for a single date (Tonight only)
  if (body.action === 'add_date') {
    const { date } = body
    if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

    const entries = getMealPlanRange(date, date)
    const entry = entries[0]
    if (!entry?.recipe_id) return NextResponse.json({ ok: true, added: 0 })
    const existing = getAllShoppingItems()
    const alreadyAddedPlanIds = new Set(existing.map(i => i.meal_plan_id).filter(Boolean))
    if (alreadyAddedPlanIds.has(entry.id)) return NextResponse.json({ ok: true, added: 0 })

    const recipes = getAllRecipes()
    const recipe = recipes.find(r => r.id === entry.recipe_id)
    if (!recipe) return NextResponse.json({ ok: true, added: 0 })

    const stapleNames = buildStapleSet(getAllPantryStaples())
    const scale = entry.servings / (recipe.servings || 1)
    const items: ReturnType<typeof addShoppingItem>[] = []

    for (const ing of recipe.ingredients) {
      if (!ing.name) continue
      if (ALWAYS_SKIP.has(ing.name.toLowerCase().trim())) continue
      if (stapleNames.has(ing.name.toLowerCase().trim())) continue
      const scaledAmount = ing.amount
        ? (parseFloat(ing.amount) * scale || ing.amount).toString()
        : ''
      items.push(addShoppingItem({
        id: uuidv4(),
        name: ing.name,
        amount: scaledAmount,
        unit: ing.unit,
        category: categorize(ing.name),
        checked: false,
        source: 'meal_plan',
        meal_plan_id: entry.id,
        ha_uid: null,
        sort_order: 999,
      }))
    }
    return NextResponse.json({ ok: true, added: items.length, recipe_name: recipe.name })
  }

  // Add single item
  if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const item = addShoppingItem({
    id: uuidv4(),
    name: body.name.trim(),
    amount: body.amount || '',
    unit: body.unit || '',
    category: body.category || categorize(body.name),
    checked: false,
    source: 'manual',
    meal_plan_id: null,
    ha_uid: null,
    sort_order: 999,
  })
  await pushToHAAndTrack([{ localId: item.id, name: [item.amount, item.unit, item.name].filter(Boolean).join(' ') }])
  return NextResponse.json(item, { status: 201 })
}

