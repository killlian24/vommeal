import { NextRequest, NextResponse } from 'next/server'
import {
  getDb, getAllShoppingItems, addShoppingItem, clearCheckedItems, clearAllItems,
  getAllRecipes, getMealPlanRange, setShoppingItemHaUid, getShoppingItemById,
  getAllPantryStaples, PantryStaple, ShoppingItem, Recipe, MealPlanEntry,
} from '@/lib/db'
import { getHomeAssistantConfig } from '@/lib/config'
import { categorize } from '@/lib/categorize'
import { normalizeShoppingText, removeActiveHAItemsForLocalItems } from '@/lib/ha'
import { randomUUID } from 'crypto'
import { format, startOfWeek, addDays } from 'date-fns'

type HATodoItem = { summary: string; uid: string; status: string }

/** Where a shopping row came from: every recipe name and meal-plan entry it serves. */
type Sources = { recipe_names: string[]; meal_plan_ids: string[] }

/** What the API returns for a shopping row (sources always parsed to arrays). */
type ShoppingItemOut = Omit<ShoppingItem, keyof Sources> & Sources

type NewShoppingItem = Parameters<typeof addShoppingItem>[0]

/** One ingredient to put on the list (from the plan or the review sheet). */
type IngredientLine = { name: string; category: string } & Sources

/** One ingredient in the review sheet ("Zutaten der Woche"). */
type PreviewItem = IngredientLine & {
  key: string
  meals: { date: string; recipe_name: string }[]
  /** new → pre-selected; staple → in Vorrat, deselected; on_list → already an unchecked row */
  status: 'new' | 'staple' | 'on_list'
}

const VALID_SOURCES = new Set<ShoppingItem['source']>(['manual', 'meal_plan', 'ha'])

/** Recipes with fewer ingredients than this get a "kaum Zutaten" hint in the review. */
const FEW_INGREDIENTS = 3

// ---------------------------------------------------------------------------
// Sources (recipe_names / meal_plan_ids JSON columns)
// ---------------------------------------------------------------------------

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : []
  } catch {
    return []
  }
}

function union(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b]))
}

/** id → sources for every shopping row, with a fallback to the legacy meal_plan_id column. */
function getSourcesById(): Map<string, Sources> {
  const rows = getDb().prepare(`
    SELECT s.id, s.recipe_names, s.meal_plan_ids, s.meal_plan_id, r.name AS legacy_recipe
    FROM shopping_list s
    LEFT JOIN meal_plan mp ON mp.id = s.meal_plan_id
    LEFT JOIN recipes r ON r.id = mp.recipe_id
  `).all() as { id: string; recipe_names: unknown; meal_plan_ids: unknown; meal_plan_id: string | null; legacy_recipe: string | null }[]
  const map = new Map<string, Sources>()
  for (const row of rows) {
    let meal_plan_ids = parseStringArray(row.meal_plan_ids)
    let recipe_names = parseStringArray(row.recipe_names)
    if (meal_plan_ids.length === 0 && row.meal_plan_id) meal_plan_ids = [row.meal_plan_id]
    if (recipe_names.length === 0 && row.legacy_recipe) recipe_names = [row.legacy_recipe]
    map.set(row.id, { recipe_names, meal_plan_ids })
  }
  return map
}

function setSources(id: string, sources: Sources) {
  getDb().prepare(`
    UPDATE shopping_list SET recipe_names = ?, meal_plan_ids = ?, updated_at = datetime('now') WHERE id = ?
  `).run(JSON.stringify(sources.recipe_names), JSON.stringify(sources.meal_plan_ids), id)
}

function withSources(items: ShoppingItem[], sources = getSourcesById()): ShoppingItemOut[] {
  return items.map(item => ({
    ...item,
    ...(sources.get(item.id) ?? { recipe_names: [], meal_plan_ids: [] }),
  }))
}

/** Every meal-plan entry that already contributed to any row (checked or not). */
function planIdsOnList(sources = getSourcesById()): Set<string> {
  const ids = new Set<string>()
  sources.forEach(s => s.meal_plan_ids.forEach(id => ids.add(id)))
  return ids
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Sunday of next week (weeks start on Monday). */
function endOfNextWeekStr(): string {
  return format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 13), 'yyyy-MM-dd')
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Merge key for an ingredient / shopping row name. */
function mergeKey(name: string): string {
  return normalizeShoppingText(name)
}

/**
 * Validate a request body / restore payload into a full shopping item, or null if it has no name.
 * ha_uid is deliberately never taken from the body: DELETE / clear_checked already removed the
 * item from Home Assistant, so a restored item must come back untracked and be re-pushed by the
 * next Sync.
 */
function buildItemFromBody(raw: unknown): { item: NewShoppingItem; sources: Sources } | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name) return null
  const source = VALID_SOURCES.has(b.source as ShoppingItem['source']) ? b.source as ShoppingItem['source'] : 'manual'
  const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim()
  const meal_plan_id = typeof b.meal_plan_id === 'string' && b.meal_plan_id ? b.meal_plan_id : null
  const meal_plan_ids = union(parseStringArray(b.meal_plan_ids), meal_plan_id ? [meal_plan_id] : [])
  return {
    item: {
      id: typeof b.id === 'string' && b.id.trim() ? b.id.trim() : randomUUID(),
      name,
      amount: str(b.amount),
      unit: str(b.unit),
      category: str(b.category) || categorize(name),
      checked: b.checked === true || b.checked === 1 || b.checked === 'true',
      source,
      meal_plan_id: meal_plan_id ?? meal_plan_ids[0] ?? null,
      ha_uid: null,
      sort_order: typeof b.sort_order === 'number' && Number.isFinite(b.sort_order) ? b.sort_order : 999,
    },
    sources: { recipe_names: parseStringArray(b.recipe_names), meal_plan_ids },
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
    const names = [key, ...(STAPLE_ALIASES[key] ?? [])]
    for (const name of names) {
      result.add(name.toLowerCase().trim())
      result.add(mergeKey(name))
    }
  }
  return result
}

function isStaple(name: string, staples: Set<string>): boolean {
  return staples.has(name.toLowerCase().trim()) || staples.has(mergeKey(name))
}

function isAlwaysSkipped(name: string): boolean {
  return ALWAYS_SKIP.has(name.toLowerCase().trim())
}

// ---------------------------------------------------------------------------
// Collecting ingredients from the plan and merging them into the list
// ---------------------------------------------------------------------------

type Collected = {
  lines: Map<string, IngredientLine & { meals: { date: string; recipe_name: string }[] }>
  hints: { recipe_name: string; count: number }[]
  meals: number
  skipped_meals: number
}

/**
 * Walk planned recipe meals (entries with a custom_meal_name or no recipe add nothing) and merge
 * their ingredients by normalized name — no amounts. Meal-plan entries already recorded on any
 * shopping row are skipped entirely so a meal never lands on the list twice.
 */
function collectFromPlan(entries: MealPlanEntry[], recipes: Map<string, Recipe>, onList: Set<string>): Collected {
  const lines: Collected['lines'] = new Map()
  const hints = new Map<string, { recipe_name: string; count: number }>()
  let meals = 0
  let skipped_meals = 0

  for (const entry of entries) {
    if (!entry.recipe_id || entry.custom_meal_name) continue
    const recipe = recipes.get(entry.recipe_id)
    if (!recipe) continue
    if (onList.has(entry.id)) { skipped_meals++; continue }
    meals++

    const named = recipe.ingredients.filter(ing => ing.name?.trim())
    if (named.length < FEW_INGREDIENTS && !hints.has(recipe.id)) {
      hints.set(recipe.id, { recipe_name: recipe.name, count: named.length })
    }

    for (const ing of named) {
      const name = ing.name.trim()
      if (isAlwaysSkipped(name)) continue
      const key = mergeKey(name)
      if (!key) continue
      const line = lines.get(key) ?? {
        name, category: categorize(name), recipe_names: [], meal_plan_ids: [], meals: [],
      }
      line.recipe_names = union(line.recipe_names, [recipe.name])
      line.meal_plan_ids = union(line.meal_plan_ids, [entry.id])
      if (!line.meals.some(m => m.date === entry.date && m.recipe_name === recipe.name)) {
        line.meals.push({ date: entry.date, recipe_name: recipe.name })
      }
      lines.set(key, line)
    }
  }
  return { lines, hints: Array.from(hints.values()), meals, skipped_meals }
}

/** Unchecked rows keyed by normalized name (first row wins). */
function uncheckedByKey(items: ShoppingItem[]): Map<string, ShoppingItem> {
  const map = new Map<string, ShoppingItem>()
  for (const item of items) {
    if (item.checked) continue
    const key = mergeKey(item.name)
    if (key && !map.has(key)) map.set(key, item)
  }
  return map
}

/**
 * Put ingredient lines on the list: one row per ingredient. A line whose name matches an unchecked
 * row is merged into it (sources appended, amount untouched); anything else becomes a new row
 * without amount or unit.
 */
function mergeIntoList(lines: IngredientLine[]): { added: ShoppingItemOut[]; merged: ShoppingItemOut[] } {
  const db = getDb()
  return db.transaction(() => {
    const sources = getSourcesById()
    const existing = uncheckedByKey(getAllShoppingItems())
    const touched = new Map<string, { item: ShoppingItem; sources: Sources; isNew: boolean }>()
    let order = 0

    for (const line of lines) {
      const name = line.name.trim()
      const key = mergeKey(name)
      if (!key) continue
      const lineSources: Sources = {
        recipe_names: union([], line.recipe_names),
        meal_plan_ids: union([], line.meal_plan_ids),
      }
      const hit = existing.get(key)
      if (hit) {
        const prev = touched.get(hit.id)?.sources ?? sources.get(hit.id) ?? { recipe_names: [], meal_plan_ids: [] }
        const next: Sources = {
          recipe_names: union(prev.recipe_names, lineSources.recipe_names),
          meal_plan_ids: union(prev.meal_plan_ids, lineSources.meal_plan_ids),
        }
        setSources(hit.id, next)
        touched.set(hit.id, { item: hit, sources: next, isNew: touched.get(hit.id)?.isNew ?? false })
        continue
      }
      const item = addShoppingItem({
        id: randomUUID(),
        name,
        amount: '',
        unit: '',
        category: line.category && line.category.trim() ? line.category.trim() : categorize(name),
        checked: false,
        source: 'meal_plan',
        meal_plan_id: lineSources.meal_plan_ids[0] ?? null,
        ha_uid: null,
        sort_order: order++,
      })
      setSources(item.id, lineSources)
      existing.set(key, item)
      touched.set(item.id, { item, sources: lineSources, isNew: true })
    }

    const added: ShoppingItemOut[] = []
    const merged: ShoppingItemOut[] = []
    touched.forEach(({ item, sources: s, isNew }) => {
      const out = { ...item, ...s } as ShoppingItemOut
      ;(isNew ? added : merged).push(out)
    })
    return { added, merged }
  })()
}

/** Plan lines minus pantry staples — what generate / add_date put on the list directly. */
function linesWithoutStaples(collected: Collected): IngredientLine[] {
  const staples = buildStapleSet(getAllPantryStaples())
  return Array.from(collected.lines.values())
    .filter(line => !isStaple(line.name, staples))
    .map(({ name, category, recipe_names, meal_plan_ids }) => ({ name, category, recipe_names, meal_plan_ids }))
}

function recipeMap(): Map<string, Recipe> {
  return new Map(getAllRecipes().map(r => [r.id, r]))
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

function haErrorMessage(error: unknown, fallback: string): string {
  const detail = error instanceof Error ? error.message : ''
  return detail ? `${fallback}: ${detail}` : fallback
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json(withSources(getAllShoppingItems()))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Ungültige Anfrage (kein JSON)' }, { status: 400 })

  // Review data for "Zutaten der Woche" — reads only, never writes.
  if (body.action === 'preview') {
    const today = todayStr()
    const rawStart = typeof body.start === 'string' && DATE_RE.test(body.start) ? body.start : today
    const end = typeof body.end === 'string' && DATE_RE.test(body.end) ? body.end : endOfNextWeekStr()
    const start = rawStart < today ? today : rawStart
    const ha_configured = !!getHomeAssistantConfig()
    if (start > end) {
      return NextResponse.json({ ok: true, start, end, ha_configured, items: [], hints: [], meals: 0, skipped_meals: 0 })
    }

    const sources = getSourcesById()
    const collected = collectFromPlan(getMealPlanRange(start, end), recipeMap(), planIdsOnList(sources))
    const staples = buildStapleSet(getAllPantryStaples())
    const onList = uncheckedByKey(getAllShoppingItems())

    const items: PreviewItem[] = Array.from(collected.lines.entries()).map(([key, line]) => ({
      key,
      ...line,
      status: onList.has(key) ? 'on_list' : isStaple(line.name, staples) ? 'staple' : 'new',
    }))
    items.sort((a, b) => a.name.localeCompare(b.name, 'de'))

    return NextResponse.json({
      ok: true, start, end, ha_configured, items,
      hints: collected.hints, meals: collected.meals, skipped_meals: collected.skipped_meals,
    })
  }

  // Commit the reviewed selection. Lines matching an unchecked row are merged into it.
  if (body.action === 'add_selected') {
    const incoming: unknown[] = Array.isArray(body.items) ? body.items : []
    const lines: IngredientLine[] = []
    for (const raw of incoming) {
      if (!raw || typeof raw !== 'object') continue
      const r = raw as Record<string, unknown>
      const name = typeof r.name === 'string' ? r.name.trim().slice(0, 200) : ''
      if (!name) continue
      lines.push({
        name,
        category: typeof r.category === 'string' ? r.category : '',
        recipe_names: parseStringArray(r.recipe_names),
        meal_plan_ids: parseStringArray(r.meal_plan_ids),
      })
    }
    const { added, merged } = mergeIntoList(lines)
    return NextResponse.json({
      ok: true, added: added.length, merged: merged.length, items: [...added, ...merged],
      ha_configured: !!getHomeAssistantConfig(),
    })
  }

  // Bulk generate from a meal plan date range (the plan page) — same no-amount merge.
  if (body.action === 'generate') {
    const { start, end } = body
    if (!start || !end) return NextResponse.json({ error: 'Start- und Enddatum fehlen' }, { status: 400 })

    // Never add ingredients for days that are already over
    const today = todayStr()
    const effectiveStart = start < today ? today : start
    if (effectiveStart > end) return NextResponse.json({ ok: true, added: 0, items: [], start: effectiveStart, end })

    const collected = collectFromPlan(getMealPlanRange(effectiveStart, end), recipeMap(), planIdsOnList())
    const { added, merged } = mergeIntoList(linesWithoutStaples(collected))
    // Don't push to HA here — the Sync button pushes remaining unchecked items.
    return NextResponse.json({ ok: true, added: added.length, merged: merged.length, items: added, start: effectiveStart, end })
  }

  // Add ingredients for a single date (Heute / Tonight)
  if (body.action === 'add_date') {
    const { date } = body
    if (!date) return NextResponse.json({ error: 'Datum fehlt' }, { status: 400 })

    const recipes = recipeMap()
    const entries = getMealPlanRange(date, date)
    const entry = entries.find(e => e.recipe_id && !e.custom_meal_name)
    if (!entry) return NextResponse.json({ ok: true, added: 0 })
    const recipe = recipes.get(entry.recipe_id as string)
    const collected = collectFromPlan([entry], recipes, planIdsOnList())
    const { added, merged } = mergeIntoList(linesWithoutStaples(collected))
    return NextResponse.json({
      ok: true, added: added.length, merged: merged.length, items: added, recipe_name: recipe?.name ?? null,
    })
  }

  if (body.action === 'clear_checked') {
    const checked = getAllShoppingItems().filter(i => i.checked)
    const config = getHomeAssistantConfig()
    if (config && checked.length > 0) {
      try {
        await removeActiveHAItemsForLocalItems(config, checked)
      } catch (error) {
        return NextResponse.json({
          error: haErrorMessage(error, 'Home Assistant nicht erreichbar'),
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
          error: haErrorMessage(error, 'Home Assistant nicht erreichbar'),
        }, { status: 502 })
      }
    }
    clearAllItems()
    return NextResponse.json({ ok: true })
  }

  // Restore previously deleted items as they were (undo for delete / clear checked).
  // Items whose id still exists are skipped so a double Undo is harmless.
  if (body.action === 'restore') {
    const incoming: unknown[] = Array.isArray(body.items) ? body.items : []
    const restored: ShoppingItem[] = []
    for (const raw of incoming) {
      const built = buildItemFromBody(raw)
      if (!built) continue
      if (getShoppingItemById(built.item.id)) continue
      try {
        restored.push(addShoppingItem(built.item))
        setSources(built.item.id, built.sources)
      } catch { /* id already exists (race) — skip */ }
    }
    return NextResponse.json({ ok: true, restored: restored.length, items: withSources(restored) })
  }

  // Add single item (optional id/category/source/meal_plan_id/checked let a
  // deleted item be re-created as it was)
  const single = buildItemFromBody(body)
  if (!single) return NextResponse.json({ error: 'Name fehlt' }, { status: 400 })
  if (getShoppingItemById(single.item.id)) {
    return NextResponse.json({ error: 'Eintrag existiert bereits' }, { status: 409 })
  }
  let item: ShoppingItem
  try {
    item = addShoppingItem(single.item)
    setSources(item.id, single.sources)
  } catch {
    return NextResponse.json({ error: 'Eintrag existiert bereits' }, { status: 409 })
  }
  // Only unchecked manual items get pushed to HA right away; everything else is
  // picked up by the next Sync.
  if (item.source === 'manual' && !item.checked) {
    await pushToHAAndTrack([{ localId: item.id, name: [item.amount, item.unit, item.name].filter(Boolean).join(' ') }])
  }
  return NextResponse.json(withSources([item])[0], { status: 201 })
}
