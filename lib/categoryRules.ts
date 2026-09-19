export const CATEGORY_IDS = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other'] as const
export type CategoryId = typeof CATEGORY_IDS[number]

export const DEFAULT_CATEGORY_ORDER: CategoryId[] = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other']

export type CategoryKeywordMap = Partial<Record<CategoryId, string[]>>

const EARLY_PANTRY_KEYWORDS = [
  'brühe', 'fond', 'bouillon', 'broth', 'stock',
  'grøntsagsbouillon', 'hønsebouillon', 'oksebouillon',
  'paprikapulver', 'chilipulver', 'knoblauchpulver', 'zwiebelpulver',
  'hvidløgspulver', 'løgpulver',
  'ras el hanout', 'ras el habout', 'garam masala', 'harissa', 'curry paste',
  'kokosmilch', 'coconut milk', 'kokosmælk',
  'passierte tomaten', 'dosentomaten', 'schältomaten', 'tomatensoße',
  'flåede tomater', 'hakkede tomater', 'tomatpure', 'tomatpuré',
  'getrocknet', 'getrocknete', 'tørret', 'tørrede',
  // Nut butters / nut pastes must win over the dairy 'butter' match
  'erdnussbutter', 'erdnussmus', 'mandelmus', 'cashewmus', 'haselnussmus', 'nussmus', 'nussbutter',
  'peanut butter', 'almond butter', 'cashew butter', 'nut butter', 'tahini', 'tahin', 'sesammus',
  // Chickpeas contain 'erbse' and would land in produce; they are pantry (dried or canned)
  'kichererbse', 'chickpea',
]

// Fresh beans / sprouts are produce even though the bare 'bohne' / 'bean'
// keyword (dried or canned pulses) lives in pantry, which is matched first.
const FRESH_PRODUCE_KEYWORDS = [
  'grüne bohnen', 'grüne bohne', 'buschbohnen', 'stangenbohnen', 'brechbohnen', 'dicke bohnen',
  'green bean', 'runner bean', 'bean sprout', 'bohnensprossen', 'bønnespire',
  'grønne bønner', 'haricots verts',
]

// Keywords that are always matched as a whole word, regardless of length.
// 'dose' / 'glas' would otherwise hit 'Glasnudeln'; 'nut' would hit 'minute',
// 'coconut', 'donut'; 'wein' would hit 'Schweinefleisch'.
const WHOLE_WORD_KEYWORDS = new Set([
  'dose', 'glas', 'gläser', 'konserve', 'konserven', 'canned', 'tinned',
  'nut', 'nuts', 'wein',
].map(normalizeCategoryText))

// Participle "gehackt/gehackte/gehackten/gehackter" ("gehackte Mandeln",
// "Petersilie, gehackt") must not trigger meat via the bare 'hack' keyword.
// 'gehacktes' (= minced meat) is deliberately kept.
const PARTICIPLE_RE = /\bgehackt(e[nr]?)?\b/g

export const BUILT_IN_CATEGORY_KEYWORDS: Record<CategoryId, string[]> = {
  produce: [
    'tomato', 'onion', 'garlic', 'lettuce', 'spinach', 'carrot', 'potato', 'sweet potato',
    'apple', 'banana', 'lemon', 'lime', 'orange', 'pear', 'peach', 'plum', 'cherry',
    'mango', 'pineapple', 'melon', 'watermelon', 'kiwi', 'fig', 'apricot', 'nectarine',
    'raspberry', 'strawberry', 'blueberry', 'blackberry', 'grape', 'pomegranate',
    'ginger', 'lemongrass', 'herb', 'basil', 'parsley', 'cilantro', 'chive', 'thyme',
    'rosemary', 'mint', 'dill', 'sage', 'oregano', 'marjoram', 'tarragon', 'bay leaf',
    'broccoli', 'zucchini', 'mushroom', 'celery', 'cucumber', 'avocado', 'berry',
    'leek', 'fennel', 'pea', 'peas', 'bean sprout', 'artichoke', 'asparagus', 'beetroot',
    'cauliflower', 'kale', 'chard', 'radish', 'spring onion', 'scallion',
    'aubergine', 'eggplant', 'pumpkin', 'squash', 'corn', 'courgette',
    'pepper', 'bell pepper', 'chili pepper', 'jalapeño', 'pak choi', 'bok choy',
    'kohlrabi', 'turnip', 'parsnip', 'celeriac', 'fruit', 'vegetable',
    'obst', 'gemüse', 'früchte', 'salat', 'karotte', 'möhre', 'zwiebel', 'schalotte',
    'frühlingszwiebel', 'knoblauch', 'tomate', 'kirschtomate', 'rispentomaten',
    'kartoffel', 'süßkartoffel', 'pastinake', 'rübe', 'steckrübe', 'sellerie',
    'staudensellerie', 'sellerieknolle', 'fenchel', 'lauch', 'porree', 'spargel',
    'rote bete', 'blumenkohl', 'brokkoli', 'romanesco', 'rosenkohl', 'grünkohl',
    'mangold', 'radieschen', 'rotkohl', 'weißkohl', 'spitzkohl', 'wirsing',
    'kohlrabi', 'aubergine', 'kürbis', 'mais', 'zucchini', 'gurke', 'paprika',
    'avocado', 'spinat', 'erbse', 'bohnensprossen', 'artischocke', 'pilz',
    'champignon', 'pfifferling', 'steinpilz', 'rucola', 'feldsalat', 'kopfsalat',
    'eisbergsalat', 'endiviensalat', 'chicorée', 'ingwer', 'zitronengras',
    'apfel', 'birne', 'pflaume', 'zwetschge', 'kirsche', 'pfirsich', 'nektarine',
    'ananas', 'melone', 'weintraube', 'feige', 'aprikose', 'granatapfel',
    'himbeere', 'erdbeere', 'brombeere', 'heidelbeere', 'johannisbeere',
    'stachelbeere', 'mandarine', 'grapefruit', 'zitrone', 'limette', 'papaya',
    'litschi', 'petersilie', 'basilikum', 'schnittlauch', 'thymian', 'rosmarin',
    'minze', 'salbei', 'koriander', 'majoran', 'estragon', 'lorbeer',
    'liebstöckel', 'bärlauch',
    'frugt', 'grønt', 'grøntsag', 'grøntsager', 'tomat', 'cherrytomat', 'løg',
    'rødløg', 'forårsløg', 'skalotteløg', 'hvidløg', 'gulerod', 'kartoffel',
    'sød kartoffel', 'selleri', 'bladselleri', 'knoldselleri', 'porre',
    'asparges', 'rødbede', 'blomkål', 'broccoli', 'rosenkål', 'grønkål',
    'bladbede', 'radise', 'rødkål', 'hvidkål', 'spidskål', 'savoykål',
    'kålrabi', 'græskar', 'majs', 'squash', 'agurk', 'peberfrugt', 'chili',
    'spinat', 'ært', 'ærter', 'bønnespire', 'bønnespirer', 'artiskok', 'svamp',
    'champignon', 'ingefær', 'citrongræs', 'æble', 'pære', 'blomme', 'kirsebær',
    'fersken', 'nektarin', 'vandmelon', 'vindrue', 'figen', 'abrikos',
    'granatæble', 'hindbær', 'jordbær', 'brombær', 'blåbær', 'ribs',
    'stikkelsbær', 'mandarin', 'grapefrugt', 'citron', 'persille', 'purløg',
    'timian', 'mynte', 'dild', 'salvie', 'merian', 'laurbær',
  ],
  meat: [
    'chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'veal', 'venison',
    'rabbit', 'fish', 'salmon', 'tuna', 'cod', 'trout', 'herring', 'mackerel',
    'sea bass', 'shrimp', 'prawn', 'crab', 'lobster', 'mussel', 'squid',
    'octopus', 'anchovy', 'sausage', 'bacon', 'ham', 'salami', 'chorizo',
    'mince', 'ground beef', 'steak', 'fillet', 'breast', 'thigh', 'wing',
    'drumstick', 'poultry', 'seafood', 'shellfish',
    'hähnchen', 'hühnchen', 'huhn', 'geflügel', 'ente', 'entenbrust',
    'entenkeule', 'pute', 'truthahn', 'putenbrust', 'kalb', 'kalbfleisch',
    'lamm', 'lammfleisch', 'lammkeule', 'lammkotelett', 'wild', 'wildschwein',
    'hirsch', 'reh', 'kaninchen', 'rindfleisch', 'rind', 'rinderhack',
    'schwein', 'schweinefleisch', 'schweinebauch', 'schweinekotelett',
    'hackfleisch', 'hack', 'mett', 'gehacktes', 'fisch', 'lachs', 'thunfisch',
    'kabeljau', 'dorsch', 'seelachs', 'forelle', 'hering', 'makrele',
    'wolfsbarsch', 'dorade', 'zander', 'hecht', 'pangasius', 'tilapia',
    'garnele', 'krabbe', 'hummer', 'muschel', 'tintenfisch', 'oktopus',
    'anchovis', 'meeresfrüchte', 'wurst', 'bratwurst', 'leberwurst',
    'blutwurst', 'weißwurst', 'würstchen', 'wiener', 'frankfurter',
    'saitenwurst', 'bockwurst', 'schinken', 'speck', 'fleisch', 'schnitzel',
    'filet', 'keule', 'flügel', 'kotelett', 'rippe', 'spareribs',
    'hähnchenbrust', 'putenbrust', 'hähnchenschenkel',
    'kylling', 'oksekød', 'svinekød', 'lam', 'lammekød', 'kalkun', 'andebryst', 'andelår',
    'kalv', 'kalvekød', 'vildt', 'kanin', 'kød', 'hakket kød', 'hakkekød',
    'hakket oksekød', 'fars', 'bøf', 'bryst', 'lår', 'vinge', 'kølle',
    'fjerkræ', 'fisk', 'laks', 'tun', 'torsk', 'ørred', 'sild', 'makrel',
    'havbars', 'reje', 'rejer', 'krabbe', 'hummer', 'musling', 'muslinger',
    'blæksprutte', 'ansjos', 'skaldyr', 'pølse', 'skinke',
  ],
  dairy: [
    'milk', 'cream', 'cheese', 'butter', 'yogurt', 'yoghurt', 'eggs', 'egg',
    'mozzarella', 'parmesan', 'cheddar', 'brie', 'camembert', 'feta', 'gouda',
    'emmental', 'ricotta', 'mascarpone', 'halloumi', 'sour cream',
    'crème fraîche', 'cream cheese', 'cottage cheese', 'quark',
    'milch', 'vollmilch', 'halbfettmilch', 'buttermilch', 'kondensmilch',
    'sahne', 'schlagsahne', 'kaffeesahne', 'schmand', 'sauerrahm', 'käse',
    'frischkäse', 'magerquark', 'skyr', 'kefir', 'hüttenkäse', 'schmelzkäse',
    'hartkäse', 'weichkäse', 'butterschmalz', 'margarine', 'joghurt',
    'naturjoghurt', 'eier', 'ei',
    // Tofu / tempeh are chilled goods sitting next to dairy in the supermarket
    'tofu', 'räuchertofu', 'seidentofu', 'tempeh',
    'mælk', 'sødmælk', 'letmælk', 'skummetmælk', 'kærnemælk', 'fløde',
    'piskefløde', 'madlavningsfløde', 'creme fraiche', 'cremefraiche', 'ost',
    'friskost', 'hytteost', 'flødeost', 'smør', 'yoghurt', 'æg',
  ],
  bakery: [
    'bread', 'bun', 'roll', 'pasta', 'noodle', 'rice noodle', 'lasagne',
    'spaghetti', 'penne', 'fusilli', 'tagliatelle', 'tortilla', 'wrap', 'pita',
    'bagel', 'croissant', 'cake', 'pastry', 'dough', 'tart', 'waffle',
    'pancake', 'cookie', 'breadcrumb', 'cornstarch', 'starch',
    'brot', 'brötchen', 'semmel', 'baguette', 'toastbrot', 'vollkornbrot',
    'mehl', 'weizenmehl', 'dinkelmehl', 'roggenmehl', 'buchweizenmehl',
    'nudel', 'tortellini', 'gnocchi', 'spätzle', 'knödel', 'brezel',
    'laugenbrezel', 'kuchen', 'torte', 'pfannkuchen', 'waffel', 'keks',
    'plätzchen', 'biskuit', 'flammkuchen', 'flammkuchenteig', 'pizzateig',
    'teig', 'grieß', 'polenta', 'bulgur', 'paniermehl', 'semmelbrösel',
    'panko', 'maisstärke', 'stärke', 'speisestärke', 'kartoffelstärke',
    'anstellgut', 'sauerteig', 'sauerteigstarter', 'levain',
    'brød', 'bolle', 'boller', 'rundstykke', 'rugbrød', 'franskbrød',
    'knækbrød', 'toastbrød', 'nudler', 'kage', 'wienerbrød', 'dej',
    'pizzadej', 'butterdej', 'tærte', 'vaffel', 'pandekage', 'småkage',
    'kiks', 'rasp', 'mel', 'hvedemel', 'rugmel', 'speltmel', 'majsstivelse',
    'stivelse', 'kartoffelmel', 'gryn', 'surdej',
  ],
  pantry: [
    ...EARLY_PANTRY_KEYWORDS,
    'oil', 'olive oil', 'sunflower oil', 'rapeseed oil', 'sesame oil',
    'coconut oil', 'vinegar', 'balsamic vinegar', 'apple cider vinegar',
    'sauce', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'soy sauce', 'pesto',
    'tomato paste', 'tomato puree', 'sriracha', 'tabasco', 'worcestershire',
    'sambal', 'miso', 'fish sauce', 'oyster sauce', 'hoisin', 'sugar', 'honey',
    'maple syrup', 'jam', 'marmalade', 'peanut butter', 'nutella', 'chocolate',
    'cocoa', 'vanilla', 'rice', 'couscous', 'quinoa', 'oat', 'cornflakes',
    'muesli', 'bean', 'lentil', 'chickpea', 'can', 'tin', 'jar', 'canned', 'tinned',
    'dried fruit', 'basmati', 'jasmine rice', 'risotto', 'nut', 'nuts', 'pistachio', 'pecan',
    'raisin', 'cranberry', 'spice', 'salt', 'pepper', 'cinnamon', 'cumin',
    'turmeric', 'chili', 'chilli', 'paprika powder', 'nutmeg', 'cardamom',
    'clove', 'curry', 'coriander powder', 'baking powder', 'baking soda',
    'yeast', 'almond', 'walnut', 'hazelnut', 'cashew', 'peanut', 'pine nut',
    'sesame', 'sunflower seed', 'pumpkin seed', 'flaxseed', 'chia',
    'öl', 'olivenöl', 'sonnenblumenöl', 'rapsöl', 'sesamöl', 'kokosnussöl',
    'essig', 'balsamico', 'apfelessig', 'weißweinessig', 'rotweinessig',
    'senf', 'sojasoße', 'tomatenmark', 'worcestershiresauce', 'fischsauce',
    'salz', 'zucker', 'puderzucker', 'vanillezucker', 'rohrzucker', 'honig',
    'ahornsirup', 'marmelade', 'schokolade', 'kakaopulver', 'kakao',
    'vanille', 'vanillepuddingpulver', 'puddingpulver', 'reis', 'basmati',
    'jasminreis', 'risotto', 'haferflocken',
    'müsli', 'linse', 'berglinsen', 'alblinsen', 'kichererbse', 'bohne',
    // Canned / jarred goods are pantry regardless of content ("Tomaten (Dose)",
    // "Gurken im Glas"). 'dose'/'glas'/'konserve' are whole-word (see
    // WHOLE_WORD_KEYWORDS); 'dosen' covers compounds like Dosenmais.
    'dose', 'dosen', 'glas', 'gläser', 'konserve', 'konserven',
    'rosinen', 'trockenfrüchte', 'pfeffer', 'schwarzer pfeffer',
    'weißer pfeffer', 'zimt', 'kreuzkümmel', 'kurkuma', 'muskat', 'kardamom',
    'nelke', 'korianderpulver', 'currypulver', 'backpulver', 'natron',
    'hefe', 'gelatine', 'agar', 'chilipaste',
    // 'nuss'/'nüsse' cover compounds and plurals (Walnüsse, Nussmischung)
    'nuss', 'nüsse', 'mandel', 'walnuss', 'haselnuss', 'cashew', 'erdnuss',
    'pekannuss', 'paranuss', 'pistazie', 'pinienkerne', 'sesam', 'sonnenblumenkerne',
    'kürbiskerne', 'leinsamen', 'chiasamen', 'fett', 'pflanzenfett',
    'kokosfett', 'schmalz',
    'olie', 'olivenolie', 'solsikkeolie', 'rapsolie', 'sesamolie',
    'kokosolie', 'eddike', 'æblecidereddike', 'sauce', 'sennep', 'soja',
    'sojasovs', 'tomatpuré', 'tomatpure', 'fiskesauce', 'østerssauce',
    'peber', 'sukker', 'flormelis', 'rørsukker', 'honning', 'ahornsirup',
    'marmelade', 'peanutbutter', 'chokolade', 'kakao', 'vanilje', 'ris',
    'havregryn', 'bønne', 'bønner', 'linse', 'linser', 'kikært', 'kikærter',
    'dåse', 'rosin', 'rosiner', 'tranebær', 'tørret frugt', 'krydderi',
    'kanel', 'spidskommen', 'gurkemeje', 'karry', 'muskatnød', 'kardemomme',
    'nellike', 'bagepulver', 'gær', 'mandel', 'mandler', 'valnød',
    'valnødder', 'hasselnød', 'hasselnødder', 'jordnød', 'jordnødder',
    'pinjekerne', 'pinjekerner', 'sesamfrø', 'solsikkekerne',
    'solsikkekerner', 'græskarkerne', 'græskarkerner', 'hørfrø', 'chiafrø',
  ],
  frozen: [
    // 'tk' is a whole-word match ("TK Erbsen", "Himbeeren (TK)"); 'eis' is
    // omitted because it is a substring of 'fleisch'.
    'frozen', 'gefroren', 'tiefkühl', 'tiefgefroren', 'tiefgekühlt', 'tk',
    'ice cream', 'eiscreme',
    'eis am stiel', 'eiskuchen', 'eiswürfel',
    'frossen', 'frosne', 'dybfrost', 'flødeis', 'ispind', 'ispinde',
    'isterning', 'isterninger',
  ],
  beverages: [
    'water', 'sparkling water', 'juice', 'wine', 'beer', 'soda', 'lemonade',
    'coffee', 'tea', 'smoothie', 'energy drink', 'coconut water',
    'apple juice', 'orange juice', 'grape juice', 'espresso', 'cappuccino',
    'latte', 'wasser', 'mineralwasser', 'sprudel', 'leitungswasser', 'saft',
    'apfelsaft', 'orangensaft', 'traubensaft', 'tomatensaft', 'wein',
    'rotwein', 'weißwein', 'weisswein', 'roséwein', 'glühwein', 'portwein',
    'schaumwein', 'dessertwein', 'rosé', 'sekt', 'prosecco', 'champagner', 'bier',
    'malzbier', 'radler', 'limonade', 'cola', 'kaffee', 'tee', 'kakao',
    'kräutertee', 'früchtetee', 'grüntee', 'schwarztee', 'pfefferminztee',
    'vand', 'danskvand', 'kildevand', 'æblejuice', 'appelsinjuice',
    'druesaft', 'vin', 'rødvin', 'hvidvin', 'øl', 'sodavand', 'kaffe', 'te',
    'energidrik',
  ],
  other: [],
}

const CATEGORY_PRIORITY: CategoryId[] = ['pantry', 'frozen', 'beverages', 'produce', 'bakery', 'meat', 'dairy']
const WHOLE_WORD_MAX_LENGTH = 3

export function normalizeCategoryText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9æøåäöüß]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchesKeyword(normalizedName: string, rawKeyword: string): boolean {
  const keyword = normalizeCategoryText(rawKeyword)
  if (!keyword) return false
  const wholeWord = WHOLE_WORD_KEYWORDS.has(keyword)
    || (keyword.length <= WHOLE_WORD_MAX_LENGTH && !keyword.includes(' '))
  if (wholeWord) {
    return new RegExp(`(^|\\s)${escapeRegExp(keyword)}($|\\s)`).test(normalizedName)
  }
  return normalizedName.includes(keyword)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findInRules(normalizedName: string, rules: CategoryKeywordMap, priority: CategoryId[]): CategoryId | null {
  for (const category of priority) {
    const keywords = rules[category] ?? []
    if (keywords.some(keyword => matchesKeyword(normalizedName, keyword))) return category
  }
  return null
}

export function sanitizeCustomCategoryKeywords(raw: unknown): CategoryKeywordMap {
  if (!raw || typeof raw !== 'object') return {}
  const out: CategoryKeywordMap = {}
  for (const category of CATEGORY_IDS) {
    const values = (raw as Record<string, unknown>)[category]
    if (!Array.isArray(values)) continue
    const cleaned = Array.from(new Set(values
      .filter((value): value is string => typeof value === 'string')
      .map(value => value.trim())
      .filter(Boolean)))
    if (cleaned.length > 0) out[category] = cleaned
  }
  return out
}

export function categorizeWithRules(name: string, customRules: CategoryKeywordMap = {}): CategoryId {
  const normalizedName = normalizeCategoryText(name)
  if (!normalizedName) return 'other'

  const customMatch = findInRules(normalizedName, customRules, DEFAULT_CATEGORY_ORDER)
  if (customMatch) return customMatch

  const builtInName = normalizedName.replace(PARTICIPLE_RE, ' ').replace(/\s+/g, ' ').trim()
  if (!builtInName) return 'other'
  if (FRESH_PRODUCE_KEYWORDS.some(keyword => matchesKeyword(builtInName, keyword))) return 'produce'

  const builtInMatch = findInRules(builtInName, BUILT_IN_CATEGORY_KEYWORDS, CATEGORY_PRIORITY)
  return builtInMatch ?? 'other'
}
