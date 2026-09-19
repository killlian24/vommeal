import { NextRequest, NextResponse } from 'next/server'
import {
  getDb, getAllShoppingItems, addShoppingItem, clearCheckedItems, clearAllItems,
  getAllRecipes, getMealPlanRange, setShoppingItemHaUid, getShoppingItemById,
  getAllPantryStaples, PantryStaple, ShoppingItem,
} from '@/lib/db'
import { getHomeAssistantConfig } from '@/lib/config'
import { categorize } from '@/lib/categorize'
import { scaleAmount } from '@/lib/quantities'
import { removeActiveHAItemsForLocalItems } from '@/lib/ha'
import { randomUUID } from 'crypto'
import { format } from 'date-fns'

type HATodoItem = { summary: string; uid: string; status: string }

type ShoppingItemWithRecipe = ShoppingItem & { recipe_name: string | null }
type NewShoppingItem = Parameters<typeof addShoppingItem>[0]
const VALID_SOURCES = new Set<ShoppingItem['source']>(['manual', 'meal_plan', 'ha'])

/** Map meal_plan_id → recipe name for every shopping item that came from the plan. */
function getRecipeNamesByPlanId(): Map<string, string> {
  const rows = getDb().prepare(`
    SELECT DISTINCT mp.id AS plan_id, r.name AS recipe_name
    FROM shopping_list s
    JOIN meal_plan mp ON mp.id = s.meal_plan_id
    JOIN recipes r ON r.id = mp.recipe_id
  `).all() as { plan_id: string; recipe_name: string }[]
  return new Map(rows.map(r => [r.plan_id, r.recipe_name]))
}

function withRecipeNames(items: ShoppingItem[], names?: Map<string, string>): ShoppingItemWithRecipe[] {
  const map = names ?? getRecipeNamesByPlanId()
  return items.map(i => ({ ...i, recipe_name: i.meal_plan_id ? (map.get(i.meal_plan_id) ?? null) : null }))
}

function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/**
 * Validate a request body / restore payload into a full shopping item, or null if it has no name.
 * ha_uid is deliberately never taken from the body: DELETE / clear_checked already removed the
 * item from Home Assistant, so a restored item must come back untracked and be re-pushed by the
 * next Sync.
 */
function buildItemFromBody(raw: unknown): NewShoppingItem | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name) return null
  const source = VALID_SOURCES.has(b.source as ShoppingItem['source']) ? b.source as ShoppingItem['source'] : 'manual'
  const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim()
  return {
    id: typeof b.id === 'string' && b.id.trim() ? b.id.trim() : randomUUID(),
    name,
    amount: str(b.amount),
    unit: str(b.unit),
    category: str(b.category) || categorize(name),
    checked: b.checked === true || b.checked === 1 || b.checked === 'true',
    source,
    meal_plan_id: typeof b.meal_plan_id === 'string' && b.meal_plan_id ? b.meal_plan_id : null,
    ha_uid: null,
    sort_order: typeof b.sort_order === 'number' && Number.isFinite(b.sort_order) ? b.sort_order : 999,
  }
}

// Bilingual alias pairs — each entry maps a name to its counterpart(s)
// Used only for staple matching, does not affect categorisation
const STAPLE_ALIASES: Record<string, string[]> = {
  // Basics
  'salz': ['salt'],                         'salt': ['salz'],
  'pfeffer': ['pepper', 'black pepper', 'peber'], 'pepper': ['pfeffer', 'peber'], 'black pepper': ['pfeffer', 'peber'], 'peber': ['pepper', 'pfeffer'],
  'zucker': ['sugar', 'sukker'],            'sugar': ['zucker', 'sukker'], 'sukker': ['sugar', 'zucker'],
  'mehl': ['flour', 'mel'],                 'flour': ['mehl', 'mel'], 'mel': ['flour', 'mehl'],
  'butter': ['butter'],
  // Oils & vinegar
  'öl': ['oil', 'olie'],                    'oil': ['öl', 'olie'], 'olie': ['oil', 'öl'],
  'olivenöl': ['olive oil', 'olivenolie'], 'olive oil': ['olivenöl', 'olivenolie'], 'olivenolie': ['olive oil', 'olivenöl'],
  'sonnenblumenöl': ['sunflower oil', 'solsikkeolie'], 'sunflower oil': ['sonnenblumenöl', 'solsikkeolie'], 'solsikkeolie': ['sunflower oil', 'sonnenblumenöl'],
  'rapsöl': ['canola oil', 'rapeseed oil', 'rapsolie'],
  'essig': ['vinegar', 'eddike'],           'vinegar': ['essig', 'eddike'], 'eddike': ['vinegar', 'essig'],
  'balsamico': ['balsamic vinegar'],        'balsamic vinegar': ['balsamico'],
  // Alliums
  'knoblauch': ['garlic', 'hvidløg'],       'garlic': ['knoblauch', 'hvidløg'], 'hvidløg': ['garlic', 'knoblauch'],
  'zwiebel': ['onion', 'onions', 'løg'],
  'zwiebeln': ['onion', 'onions', 'løg'],  'onion': ['zwiebel', 'zwiebeln', 'løg'], 'onions': ['zwiebel', 'zwiebeln', 'løg'], 'løg': ['onion', 'zwiebel'],
  // Dairy & eggs
  'milch': ['milk', 'mælk'],                'milk': ['milch', 'mælk'], 'mælk': ['milk', 'milch'],
  'ei': ['egg', 'eggs', 'æg'],
  'eier': ['egg', 'eggs', 'æg'],           'egg': ['ei', 'eier', 'æg'], 'eggs': ['ei', 'eier', 'æg'], 'æg': ['egg', 'eier'],
  'sahne': ['cream', 'heavy cream', 'fløde'], 'cream': ['sahne', 'fløde'], 'heavy cream': ['sahne', 'fløde'], 'fløde': ['cream', 'sahne'],
  // Sweeteners
  'honig': ['honey', 'honning'],            'honey': ['honig', 'honning'], 'honning': ['honey', 'honig'],
  'ahornsirup': ['maple syrup', 'ahornsirup'], 'maple syrup': ['ahornsirup'],
  // Sauces & pastes
  'tomatenmark': ['tomato paste', 'tomato puree'],
  'tomato paste': ['tomatenmark'],          'tomato puree': ['tomatenmark'],
  'sojasoße': ['soy sauce', 'soya sauce'], 'soy sauce': ['sojasoße'], 'soya sauce': ['sojasoße'],
  'senf': ['mustard', 'sennep'],            'mustard': ['senf', 'sennep'], 'sennep': ['mustard', 'senf'],
  // Stocks & broth
  'brühe': ['broth', 'stock', 'bouillon'],
  'gemüsebrühe': ['vegetable broth', 'vegetable stock'],
  'hühnerbrühe': ['chicken broth', 'chicken stock'],
  'broth': ['brühe'],                       'stock': ['brühe'],
  // Baking
  'backpulver': ['baking powder', 'bagepulver'], 'baking powder': ['backpulver', 'bagepulver'], 'bagepulver': ['baking powder', 'backpulver'],
  'natron': ['baking soda'],                'baking soda': ['natron'],
  'hefe': ['yeast', 'gær'],                 'yeast': ['hefe', 'gær'], 'gær': ['yeast', 'hefe'],
  'vanille': ['vanilla', 'vanilje'],        'vanilla': ['vanille', 'vanilje'], 'vanilje': ['vanilla', 'vanille'],
  // Grains & pasta
  'reis': ['rice', 'ris'],                  'rice': ['reis', 'ris'], 'ris': ['rice', 'reis'],
  'nudeln': ['pasta', 'noodles', 'nudler'], 'pasta': ['nudeln', 'nudler'], 'noodles': ['nudeln', 'nudler'], 'nudler': ['noodles', 'nudeln'],
  // Spices
  'paprikapulver': ['paprika', 'paprika powder'],
  'kreuzkümmel': ['cumin'],                 'cumin': ['kreuzkümmel'],
  'zimt': ['cinnamon', 'kanel'],            'cinnamon': ['zimt', 'kanel'], 'kanel': ['cinnamon', 'zimt'],
  'kurkuma': ['turmeric', 'gurkemeje'],     'turmeric': ['kurkuma', 'gurkemeje'], 'gurkemeje': ['turmeric', 'kurkuma'],
  'oregano': ['oregano'],
  'muskat': ['nutmeg'],                     'nutmeg': ['muskat'],
  'chili': ['chili', 'chilli', 'chili flakes', 'chilli flakes'],
  // Citrus
  'zitronensaft': ['lemon juice', 'citronsaft'], 'lemon juice': ['zitronensaft', 'citronsaft'], 'citronsaft': ['lemon juice', 'zitronensaft'],
  'zitronenabrieb': ['lemon zest'],         'lemon zest': ['zitronenabrieb'],
  // Nuts & seeds
  'sesam': ['sesame', 'sesame seeds', 'sesamfrø'], 'sesame': ['sesam', 'sesamfrø'],
  'mandeln': ['almonds', 'mandler'],        'almonds': ['mandeln', 'mandler'], 'mandler': ['almonds', 'mandeln'],
}

// Always skipped regardless of pantry settings — nobody shops for these
const ALWAYS_SKIP = new Set([
  'water', 'wasser', 'sparkling water', 'mineralwasser', 'tap water', 'leitungswasser',
  'vand', 'danskvand', 'postevand',
  'salt', 'salz', 'sea salt', 'meersalz', 'table salt', 'kosher salt',
  'pepper', 'pfeffer', 'peber', 'black pepper', 'schwarzer pfeffer', 'sort peber', 'white pepper', 'weißer pfeffer', 'hvid peber',
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
  return NextResponse.json(withRecipeNames(getAllShoppingItems()))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })

  // Bulk generate from meal plan date range
  if (body.action === 'generate') {
    const { start, end } = body
    if (!start || !end) return NextResponse.json({ error: 'start and end required' }, { status: 400 })

    // Never add ingredients for days that are already over
    const today = todayStr()
    const effectiveStart = start < today ? today : start
    if (effectiveStart > end) return NextResponse.json({ ok: true, added: 0, items: [], start: effectiveStart, end })

    const entries = getMealPlanRange(effectiveStart, end)
    const recipes = getAllRecipes()
    const recipeMap = new Map(recipes.map(r => [r.id, r]))

    // Skip meal plan entries whose ingredients are already in the list
    const existing = getAllShoppingItems()
    const alreadyAddedPlanIds = new Set(existing.map(i => i.meal_plan_id).filter(Boolean))

    // Skip pantry staples (bilingual-aware)
    const stapleNames = buildStapleSet(getAllPantryStaples())

    const items: ShoppingItemWithRecipe[] = []
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
        const added = addShoppingItem({
          id: randomUUID(),
          name: ing.name,
          amount: scaleAmount(ing.amount, ing.unit, scale),
          unit: ing.unit,
          category: categorize(ing.name),
          checked: false,
          source: 'meal_plan',
          meal_plan_id: entry.id,
          ha_uid: null,
          sort_order: items.length,
        })
        items.push({ ...added, recipe_name: recipe.name })
      }
    }
    // Don't push to HA here — let the user review and check off what they have,
    // then the Sync button will push remaining unchecked items to HA.
    return NextResponse.json({ ok: true, added: items.length, items, start: effectiveStart, end })
  }

  if (body.action === 'clear_checked') {
    const checked = getAllShoppingItems().filter(i => i.checked)
    const config = getHomeAssistantConfig()
    if (config && checked.length > 0) {
      try {
        await removeActiveHAItemsForLocalItems(config, checked)
      } catch (error) {
        return NextResponse.json({
          error: error instanceof Error ? error.message : 'could not remove Home Assistant items',
        }, { status: 502 })
      }
    }
    clearCheckedItems()
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'clear_all') {
    const activeHaItems = getAllShoppingItems().filter(i => !i.checked)
    const config = getHomeAssistantConfig()
    if (config && activeHaItems.length > 0) {
      try {
        await removeActiveHAItemsForLocalItems(config, activeHaItems)
      } catch (error) {
        return NextResponse.json({
          error: error instanceof Error ? error.message : 'could not remove Home Assistant items',
        }, { status: 502 })
      }
    }
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
    const items: ShoppingItemWithRecipe[] = []

    for (const ing of recipe.ingredients) {
      if (!ing.name) continue
      if (ALWAYS_SKIP.has(ing.name.toLowerCase().trim())) continue
      if (stapleNames.has(ing.name.toLowerCase().trim())) continue
      const added = addShoppingItem({
        id: randomUUID(),
        name: ing.name,
        amount: scaleAmount(ing.amount, ing.unit, scale),
        unit: ing.unit,
        category: categorize(ing.name),
        checked: false,
        source: 'meal_plan',
        meal_plan_id: entry.id,
        ha_uid: null,
        sort_order: 999,
      })
      items.push({ ...added, recipe_name: recipe.name })
    }
    return NextResponse.json({ ok: true, added: items.length, items, recipe_name: recipe.name })
  }

  // Restore previously deleted items as they were (undo for delete / clear checked).
  // Items whose id still exists are skipped so a double Undo is harmless.
  if (body.action === 'restore') {
    const incoming: unknown[] = Array.isArray(body.items) ? body.items : []
    const restored: ShoppingItem[] = []
    for (const raw of incoming) {
      const item = buildItemFromBody(raw)
      if (!item) continue
      if (getShoppingItemById(item.id)) continue
      try {
        restored.push(addShoppingItem(item))
      } catch { /* id already exists (race) — skip */ }
    }
    return NextResponse.json({ ok: true, restored: restored.length, items: withRecipeNames(restored) })
  }

  // Add single item (optional id/category/source/meal_plan_id/checked let a
  // deleted item be re-created as it was)
  const single = buildItemFromBody(body)
  if (!single) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (getShoppingItemById(single.id)) {
    return NextResponse.json({ error: 'item with this id already exists' }, { status: 409 })
  }
  let item: ShoppingItem
  try {
    item = addShoppingItem(single)
  } catch {
    return NextResponse.json({ error: 'item with this id already exists' }, { status: 409 })
  }
  // Only unchecked manual items get pushed to HA right away; everything else is
  // picked up by the next Sync.
  if (item.source === 'manual' && !item.checked) {
    await pushToHAAndTrack([{ localId: item.id, name: [item.amount, item.unit, item.name].filter(Boolean).join(' ') }])
  }
  return NextResponse.json(withRecipeNames([item])[0], { status: 201 })
}
