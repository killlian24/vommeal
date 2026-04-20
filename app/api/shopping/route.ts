import { NextRequest, NextResponse } from 'next/server'
import {
  getAllShoppingItems, addShoppingItem, clearCheckedItems, clearAllItems,
  getAllRecipes, getMealPlanRange, getSetting, setShoppingItemHaUid,
  getAllPantryStaples, PantryStaple,
} from '@/lib/db'
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
  const haUrl = getSetting('ha_url')
  const token = getSetting('ha_token')
  const entity = getSetting('ha_entity')
  if (!haUrl || !token || !entity || items.length === 0) return

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

const PRODUCE_KEYWORDS = [
  // English
  'tomato', 'onion', 'garlic', 'pepper', 'lettuce', 'spinach', 'carrot', 'potato', 'sweet potato',
  'apple', 'banana', 'lemon', 'lime', 'orange', 'pear', 'peach', 'plum', 'cherry', 'mango', 'pineapple', 'melon', 'watermelon', 'kiwi', 'fig', 'apricot',
  'herb', 'basil', 'parsley', 'cilantro', 'chive', 'thyme', 'rosemary', 'mint', 'dill', 'sage',
  'broccoli', 'zucchini', 'mushroom', 'celery', 'cucumber', 'avocado', 'berry', 'grape',
  'leek', 'fennel', 'pea', 'bean sprout', 'artichoke', 'asparagus', 'beetroot', 'cabbage', 'cauliflower',
  'kale', 'chard', 'radish', 'spring onion', 'scallion', 'aubergine', 'eggplant', 'pumpkin', 'squash',
  'corn', 'courgette',
  // German
  'salat', 'karotte', 'möhre', 'zwiebel', 'schalotte', 'frühlingszwiebel', 'knoblauch', 'tomate', 'kirschtomate',
  'apfel', 'birne', 'pflaume', 'zwetschge', 'kirsche', 'pfirsich', 'mango', 'ananas', 'melone', 'weintraube', 'feige', 'aprikose',
  'zitrone', 'limette', 'orange', 'mandarine', 'grapefruit',
  'pilz', 'champignon', 'pfifferling', 'steinpilz',
  'lauch', 'porree', 'fenchel', 'erbse', 'bohnensprossen', 'artischocke', 'spargel', 'rote bete', 'kohl', 'blumenkohl',
  'brokkoli', 'rosenkohl', 'grünkohl', 'mangold', 'radieschen', 'aubergine', 'kürbis', 'mais', 'zucchini',
  'gurke', 'paprika', 'sellerie', 'avocado', 'spinat', 'kartoffel', 'süßkartoffel',
  'petersilie', 'basilikum', 'schnittlauch', 'thymian', 'rosmarin', 'minze', 'dill', 'salbei', 'koriander',
]
const MEAT_KEYWORDS = [
  // English
  'chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'veal', 'venison', 'rabbit',
  'fish', 'salmon', 'tuna', 'cod', 'trout', 'herring', 'mackerel', 'sea bass', 'shrimp', 'prawn', 'crab', 'lobster', 'mussel', 'squid',
  'sausage', 'bacon', 'ham', 'salami', 'chorizo', 'mince', 'ground beef', 'steak', 'fillet', 'breast', 'thigh', 'wing',
  // German
  'hähnchen', 'huhn', 'hühnchen', 'ente', 'pute', 'truthahn', 'kalb', 'lamm', 'wild', 'kaninchen',
  'rindfleisch', 'rind', 'schwein', 'schweinefleisch', 'hackfleisch', 'hack', 'mett', 'gehacktes',
  'lachs', 'thunfisch', 'kabeljau', 'forelle', 'hering', 'makrele', 'garnele', 'krabbe', 'muschel', 'tintenfisch',
  'wurst', 'bratwurst', 'leberwurst', 'salami', 'schinken', 'speck', 'fleisch', 'steak', 'schnitzel', 'filet', 'keule', 'flügel',
]
const DAIRY_KEYWORDS = [
  // English
  'milk', 'cream', 'cheese', 'butter', 'yogurt', 'yoghurt', 'egg',
  'mozzarella', 'parmesan', 'cheddar', 'brie', 'camembert', 'feta', 'gouda', 'emmental', 'ricotta', 'mascarpone',
  'sour cream', 'crème fraîche', 'cream cheese', 'cottage cheese', 'quark',
  // German
  'milch', 'sahne', 'schlagsahne', 'kaffeesahne', 'schmand', 'sauerrahm', 'crème fraîche',
  'käse', 'frischkäse', 'quark', 'magerquark', 'skyr', 'kefir',
  'butter', 'margarine', 'joghurt', 'naturjoghurt',
  'ei', 'eier',
]
const BAKERY_KEYWORDS = [
  // English
  'bread', 'flour', 'bun', 'roll', 'pasta', 'noodle', 'rice noodle', 'lasagne', 'spaghetti', 'penne', 'fusilli', 'tortilla', 'wrap', 'pita', 'bagel', 'croissant', 'cake', 'pastry',
  // German
  'brot', 'brötchen', 'semmel', 'baguette', 'toastbrot', 'vollkornbrot', 'mehl', 'nudel', 'spaghetti', 'penne', 'lasagne', 'tortellini', 'gnocchi', 'knödel', 'brezel', 'laugenbrezel', 'croissant', 'kuchen',
]
const PANTRY_KEYWORDS = [
  // English
  'oil', 'olive oil', 'vinegar', 'sauce', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'soy sauce', 'pesto', 'tomato paste',
  'salt', 'sugar', 'honey', 'maple syrup', 'jam', 'marmalade', 'peanut butter', 'nutella', 'chocolate',
  'rice', 'couscous', 'quinoa', 'oat', 'cornflakes', 'muesli',
  'bean', 'lentil', 'chickpea', 'can', 'tin', 'stock', 'broth', 'bouillon',
  'spice', 'cinnamon', 'cumin', 'turmeric', 'oregano', 'chili', 'curry', 'pepper', 'paprika powder', 'nutmeg', 'cardamom', 'clove',
  'baking powder', 'baking soda', 'yeast', 'vanilla', 'cocoa', 'almond', 'walnut', 'hazelnut', 'cashew', 'peanut', 'pine nut', 'sesame',
  'dried fruit', 'raisin', 'cranberry',
  // German
  'öl', 'olivenöl', 'sonnenblumenöl', 'rapsöl', 'essig', 'balsamico',
  'senf', 'ketchup', 'mayo', 'mayonnaise', 'sojasoße', 'pesto', 'tomatenmark', 'passierte tomaten', 'tomatensoße',
  'salz', 'zucker', 'honig', 'ahornsirup', 'marmelade', 'nutella', 'schokolade',
  'reis', 'couscous', 'quinoa', 'haferflocken', 'müsli', 'cornflakes',
  'bohne', 'linse', 'kichererbse', 'dose', 'brühe', 'fond', 'bouillon',
  'gewürz', 'zimt', 'kreuzkümmel', 'kurkuma', 'oregano', 'chili', 'curry', 'muskat', 'kardamom', 'nelke', 'paprikapulver',
  'backpulver', 'natron', 'hefe', 'vanille', 'kakao',
  'mandel', 'walnuss', 'haselnuss', 'cashew', 'erdnuss', 'pinienkerne', 'sesam', 'sonnenblumenkerne', 'kürbiskerne',
  'rosinen', 'trockenfrüchte',
]
const FROZEN_KEYWORDS = ['frozen', 'gefroren', 'tiefkühl', 'eis', 'ice cream']
const BEVERAGE_KEYWORDS = [
  // English
  'water', 'sparkling water', 'juice', 'wine', 'beer', 'soda', 'lemonade', 'coffee', 'tea', 'milk drink', 'smoothie', 'energy drink', 'coconut water',
  // German
  'wasser', 'mineralwasser', 'sprudel', 'saft', 'wein', 'rotwein', 'weißwein', 'sekt', 'bier', 'limonade', 'cola', 'kaffee', 'tee', 'kakao', 'smoothie',
]

function categorize(name: string): string {
  const n = name.toLowerCase()
  if (FROZEN_KEYWORDS.some(k => n.includes(k))) return 'frozen'
  if (PRODUCE_KEYWORDS.some(k => n.includes(k))) return 'produce'
  if (MEAT_KEYWORDS.some(k => n.includes(k))) return 'meat'
  if (DAIRY_KEYWORDS.some(k => n.includes(k))) return 'dairy'
  if (BAKERY_KEYWORDS.some(k => n.includes(k))) return 'bakery'
  if (PANTRY_KEYWORDS.some(k => n.includes(k))) return 'pantry'
  if (BEVERAGE_KEYWORDS.some(k => n.includes(k))) return 'beverages'
  return 'other'
}
