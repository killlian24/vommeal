// Priority-pantry: checked BEFORE produce so compound words like
// 'Gemüsebrühe' don't land in produce via 'gemüse', and powdered spices
// like 'Paprikapulver' don't land in produce via 'paprika'.
const EARLY_PANTRY_KEYWORDS = [
  // Stocks & broths
  'brühe', 'fond', 'bouillon', 'broth', 'stock',
  'grøntsagsbouillon', 'hønsebouillon', 'oksebouillon',
  // Powdered spices that share names with fresh produce
  'paprikapulver', 'chilipulver', 'knoblauchpulver', 'zwiebelpulver',
  'hvidløgspulver', 'løgpulver',
  // Spice blends
  'ras el hanout', 'ras el habout', 'garam masala', 'harissa', 'curry paste',
  // Coconut milk is pantry (canned), not dairy
  'kokosmilch', 'coconut milk', 'kokosmælk',
  // Canned/pureed tomatoes are pantry even though they contain 'tomate'
  'passierte tomaten', 'dosentomaten', 'schältomaten', 'tomatensoße',
  'flåede tomater', 'hakkede tomater', 'tomatpure', 'tomatpuré',
  // Anything dried is shelf-stable pantry, not fresh produce
  'getrocknet', 'getrocknete', 'tørret', 'tørrede',
]

const FROZEN_KEYWORDS = [
  'frozen', 'gefroren', 'tiefkühl', 'tiefgefroren', 'frossen', 'frosne', 'dybfrost',
  // 'eis' omitted — substring of 'fleisch'. Use specific forms instead:
  'ice cream', 'eiscreme', 'eis am stiel', 'eiskuchen', 'eiswürfel',
  'flødeis', 'ispind', 'ispinde', 'isterning', 'isterninger',
]

const PRODUCE_KEYWORDS = [
  // ── English ──
  'tomato', 'onion', 'garlic', 'lettuce', 'spinach', 'carrot', 'potato', 'sweet potato',
  'apple', 'banana', 'lemon', 'lime', 'orange', 'pear', 'peach', 'plum', 'cherry',
  'mango', 'pineapple', 'melon', 'watermelon', 'kiwi', 'fig', 'apricot', 'nectarine',
  'raspberry', 'strawberry', 'blueberry', 'blackberry', 'grape', 'pomegranate',
  'ginger', 'lemongrass',
  'herb', 'basil', 'parsley', 'cilantro', 'chive', 'thyme', 'rosemary', 'mint',
  'dill', 'sage', 'oregano', 'marjoram', 'tarragon', 'bay leaf',
  'broccoli', 'zucchini', 'mushroom', 'celery', 'cucumber', 'avocado', 'berry',
  'leek', 'fennel', 'pea', 'bean sprout', 'artichoke', 'asparagus', 'beetroot',
  'cauliflower', 'kale', 'chard', 'radish', 'spring onion', 'scallion',
  'aubergine', 'eggplant', 'pumpkin', 'squash', 'corn', 'courgette',
  'pepper', 'bell pepper', 'chili pepper', 'jalapeño',
  'pak choi', 'bok choy', 'kohlrabi', 'turnip', 'parsnip', 'celeriac',
  'fruit', 'vegetable',
  // ── German ──
  'obst', 'gemüse', 'früchte', 'salat',
  // Vegetables
  'karotte', 'möhre', 'zwiebel', 'schalotte', 'frühlingszwiebel',
  'knoblauch', 'tomate', 'kirschtomate', 'rispentomaten',
  'kartoffel', 'süßkartoffel', 'pastinake', 'rübe', 'steckrübe',
  'sellerie', 'staudensellerie', 'sellerieknolle', 'fenchel', 'lauch', 'porree',
  'spargel', 'rote bete', 'blumenkohl', 'brokkoli', 'romanesco',
  'rosenkohl', 'grünkohl', 'mangold', 'radieschen',
  'rotkohl', 'weißkohl', 'spitzkohl', 'wirsing', 'kohlrabi',  // bare 'kohl' removed (false-positive on 'Kohlensäure')
  'aubergine', 'kürbis', 'mais', 'zucchini', 'gurke', 'paprika', 'avocado', 'spinat',
  'erbse', 'bohnensprossen', 'artischocke', 'pilz', 'champignon', 'pfifferling', 'steinpilz',
  'pak choi', 'rucola', 'feldsalat', 'kopfsalat', 'eisbergsalat', 'endiviensalat', 'chicorée',
  'ingwer', 'zitronengras',
  // Fruit
  'apfel', 'birne', 'pflaume', 'zwetschge', 'kirsche', 'pfirsich', 'nektarine',
  'ananas', 'melone', 'weintraube', 'feige', 'aprikose', 'granatapfel',
  'himbeere', 'erdbeere', 'brombeere', 'heidelbeere', 'johannisbeere', 'stachelbeere',
  'mandarine', 'grapefruit', 'zitrone', 'limette', 'papaya', 'litschi',
  // Herbs
  'petersilie', 'basilikum', 'schnittlauch', 'thymian', 'rosmarin', 'minze',
  'dill', 'salbei', 'koriander', 'majoran', 'estragon', 'lorbeer', 'liebstöckel', 'bärlauch',
  // ── Danish ──
  'frugt', 'grønt', 'grøntsag', 'grøntsager', 'salat',
  // Vegetables
  'tomat', 'cherrytomat', 'løg', 'rødløg', 'forårsløg', 'skalotteløg', 'hvidløg',
  'gulerod', 'kartoffel', 'sød kartoffel', 'selleri', 'bladselleri', 'knoldselleri',
  'fennikel', 'porre', 'asparges', 'rødbede', 'blomkål', 'broccoli', 'romanesco',
  'rosenkål', 'grønkål', 'bladbede', 'radise', 'rødkål', 'hvidkål', 'spidskål',
  'savoykål', 'kålrabi', 'aubergine', 'græskar', 'majs', 'squash', 'agurk',
  'peberfrugt', 'chili', 'avocado', 'spinat', 'ært', 'ærter', 'bønnespire',
  'bønnespirer', 'artiskok', 'svamp', 'champignon', 'ingefær', 'citrongræs',
  // Fruit
  'æble', 'pære', 'blomme', 'kirsebær', 'fersken', 'nektarin', 'ananas',
  'melon', 'vandmelon', 'vindrue', 'figen', 'abrikos', 'granatæble',
  'hindbær', 'jordbær', 'brombær', 'blåbær', 'ribs', 'stikkelsbær',
  'mandarin', 'grapefrugt', 'citron', 'lime', 'papaya',
  // Herbs
  'persille', 'basilikum', 'purløg', 'timian', 'rosmarin', 'mynte',
  'dild', 'salvie', 'koriander', 'merian', 'estragon', 'laurbær',
]

const MEAT_KEYWORDS = [
  // ── English ──
  'chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'veal', 'venison', 'rabbit',
  'fish', 'salmon', 'tuna', 'cod', 'trout', 'herring', 'mackerel', 'sea bass',
  'shrimp', 'prawn', 'crab', 'lobster', 'mussel', 'squid', 'octopus', 'anchovy',
  'sausage', 'bacon', 'ham', 'salami', 'chorizo', 'mince', 'ground beef',
  'steak', 'fillet', 'breast', 'thigh', 'wing', 'drumstick',
  'poultry', 'seafood', 'shellfish',
  // ── German ──
  'hähnchen', 'hühnchen', 'huhn', 'geflügel',
  'ente', 'entenbrust', 'entenkeule',
  'pute', 'truthahn', 'putenbrust',
  'kalb', 'kalbfleisch',
  'lamm', 'lammfleisch', 'lammkeule', 'lammkotelett',
  'wild', 'wildschwein', 'hirsch', 'reh', 'kaninchen',
  'rindfleisch', 'rind', 'rinderhack',
  'schwein', 'schweinefleisch', 'schweinebauch', 'schweinekotelett',
  'hackfleisch', 'hack', 'mett', 'gehacktes',
  'fisch',
  'lachs', 'thunfisch', 'kabeljau', 'dorsch', 'seelachs', 'forelle', 'hering',
  'makrele', 'wolfsbarsch', 'dorade', 'zander', 'hecht', 'pangasius', 'tilapia',
  'garnele', 'krabbe', 'hummer', 'muschel', 'tintenfisch', 'oktopus', 'anchovis',
  'meeresfrüchte',
  'wurst', 'bratwurst', 'leberwurst', 'blutwurst', 'weißwurst',
  'würstchen', 'wiener', 'frankfurter', 'saitenwurst', 'bockwurst',
  'salami', 'schinken', 'speck', 'fleisch', 'steak', 'schnitzel', 'filet',
  'keule', 'flügel', 'kotelett', 'rippe', 'spareribs',
  'hähnchenbrust', 'putenbrust', 'hähnchenschenkel',
  // ── Danish ──
  'kylling', 'oksekød', 'svinekød', 'lam', 'lammekød', 'kalkun', 'and',
  'kalv', 'kalvekød', 'vildt', 'kanin', 'kød', 'hakket kød', 'hakkekød',
  'hakket oksekød', 'fars', 'bøf', 'filet', 'bryst', 'lår', 'vinge', 'kølle',
  'fjerkræ', 'fisk', 'laks', 'tun', 'torsk', 'ørred', 'sild', 'makrel',
  'havbars', 'reje', 'rejer', 'krabbe', 'hummer', 'musling', 'muslinger',
  'blæksprutte', 'ansjos', 'skaldyr', 'pølse', 'bacon', 'skinke', 'salami',
]

const DAIRY_KEYWORDS = [
  // ── English ──
  'milk', 'cream', 'cheese', 'butter', 'yogurt', 'yoghurt',
  // 'egg'/'eggs' handled via 'eier'/'ei' below — no bare 'ei' here to avoid false positives
  'eggs', 'egg',
  'mozzarella', 'parmesan', 'cheddar', 'brie', 'camembert', 'feta',
  'gouda', 'emmental', 'ricotta', 'mascarpone', 'halloumi',
  'sour cream', 'crème fraîche', 'cream cheese', 'cottage cheese', 'quark',
  // ── German ──
  'milch', 'vollmilch', 'halbfettmilch', 'buttermilch', 'kondensmilch',
  'sahne', 'schlagsahne', 'kaffeesahne', 'schmand', 'sauerrahm',
  'käse', 'frischkäse', 'quark', 'magerquark', 'skyr', 'kefir',
  'hüttenkäse', 'schmelzkäse', 'hartkäse', 'weichkäse',
  'butter', 'butterschmalz', 'margarine',
  'joghurt', 'naturjoghurt', 'crème fraîche',
  'eier',
  // ── Danish ──
  'mælk', 'sødmælk', 'letmælk', 'skummetmælk', 'kærnemælk',
  'fløde', 'piskefløde', 'madlavningsfløde', 'creme fraiche', 'cremefraiche',
  'ost', 'friskost', 'hytteost', 'flødeost', 'parmesan', 'mozzarella',
  'cheddar', 'brie', 'camembert', 'feta', 'gouda', 'ricotta', 'mascarpone',
  'halloumi', 'smør', 'margarine', 'yoghurt', 'skyr', 'kefir', 'æg',
  // Note: bare 'ei' is handled with word-boundary regex in categorize() below
  // to avoid false positives inside words like 'kleine', 'keine', etc.
]

const BAKERY_KEYWORDS = [
  // ── English ──
  'bread', 'bun', 'roll', 'pasta', 'noodle', 'rice noodle', 'lasagne', 'spaghetti',
  'penne', 'fusilli', 'tagliatelle', 'tortilla', 'wrap', 'pita', 'bagel',
  'croissant', 'cake', 'pastry', 'dough', 'tart', 'waffle', 'pancake', 'cookie',
  'breadcrumb', 'cornstarch', 'starch',
  // ── German ──
  'brot', 'brötchen', 'semmel', 'baguette', 'toastbrot', 'vollkornbrot',
  'mehl', 'weizenmehl', 'dinkelmehl', 'roggenmehl', 'buchweizenmehl',
  'nudel', 'penne', 'lasagne', 'tortellini', 'gnocchi', 'spätzle',
  'knödel', 'brezel', 'laugenbrezel', 'croissant', 'kuchen', 'torte',
  'pfannkuchen', 'waffel', 'keks', 'plätzchen', 'biskuit',
  'flammkuchen', 'flammkuchenteig', 'pizzateig', 'teig',
  'grieß', 'polenta', 'bulgur',
  'paniermehl', 'semmelbrösel', 'panko',
  'maisstärke', 'stärke', 'speisestärke', 'kartoffelstärke',
  'anstellgut', 'sauerteig', 'sauerteigstarter', 'levain',
  // ── Danish ──
  'brød', 'bolle', 'boller', 'rundstykke', 'rugbrød', 'franskbrød',
  'knækbrød', 'baguette', 'toastbrød', 'pasta', 'nudel', 'nudler',
  'lasagne', 'spaghetti', 'penne', 'tortilla', 'wrap', 'pita', 'bagel',
  'croissant', 'kage', 'wienerbrød', 'dej', 'pizzadej', 'butterdej',
  'tærte', 'vaffel', 'pandekage', 'småkage', 'kiks', 'rasp', 'panko',
  'mel', 'hvedemel', 'rugmel', 'speltmel', 'majsstivelse', 'stivelse',
  'kartoffelmel', 'gryn', 'polenta', 'bulgur', 'surdej',
]

const PANTRY_KEYWORDS = [
  // ── English oils, vinegars, sauces ──
  'oil', 'olive oil', 'sunflower oil', 'rapeseed oil', 'sesame oil', 'coconut oil',
  'vinegar', 'balsamic vinegar', 'apple cider vinegar',
  'sauce', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'soy sauce', 'pesto',
  'tomato paste', 'tomato puree', 'sriracha', 'tabasco', 'worcestershire',
  'sambal', 'miso', 'fish sauce', 'oyster sauce', 'hoisin',
  // ── English sweeteners, spreads ──
  'sugar', 'honey', 'maple syrup', 'jam', 'marmalade', 'peanut butter',
  'nutella', 'chocolate', 'cocoa', 'vanilla',
  // ── English grains, pulses, canned ──
  'rice', 'couscous', 'quinoa', 'oat', 'cornflakes', 'muesli',
  'bean', 'lentil', 'chickpea', 'can', 'tin',
  'dried fruit', 'raisin', 'cranberry',
  // ── English spices ──
  'spice', 'salt', 'pepper', 'cinnamon', 'cumin', 'turmeric', 'chili', 'chilli',
  'paprika powder', 'nutmeg', 'cardamom', 'clove', 'curry', 'coriander powder',
  'baking powder', 'baking soda', 'yeast',
  'ras el hanout', 'ras el habout', 'garam masala', 'harissa',
  // ── English nuts & seeds ──
  'almond', 'walnut', 'hazelnut', 'cashew', 'peanut', 'pine nut', 'sesame',
  'sunflower seed', 'pumpkin seed', 'flaxseed', 'chia',
  // ── German oils, vinegars, sauces ──
  'öl', 'olivenöl', 'sonnenblumenöl', 'rapsöl', 'sesamöl', 'kokosnussöl',
  'essig', 'balsamico', 'apfelessig', 'weißweinessig', 'rotweinessig',
  'senf', 'sojasoße', 'tomatenmark', 'passierte tomaten', 'tomatensoße',
  'dosentomaten', 'schältomaten', 'worcestershiresauce', 'fischsauce',
  // ── German sweeteners, spreads ──
  'salz', 'zucker', 'puderzucker', 'vanillezucker', 'rohrzucker',
  'honig', 'ahornsirup', 'marmelade', 'nutella', 'schokolade', 'kakaopulver', 'kakao',
  'vanille', 'vanillepuddingpulver', 'puddingpulver',
  // ── German grains, pulses, canned ──
  'reis', 'couscous', 'quinoa', 'haferflocken', 'müsli', 'cornflakes',
  'linse', 'berglinsen', 'alblinsen', 'kichererbse', 'bohne', 'dose',
  'rosinen', 'trockenfrüchte', 'aprikosen getrocknet', 'getrocknete',
  // ── German spices & seasonings ──
  'pfeffer', 'schwarzer pfeffer', 'weißer pfeffer',
  'zimt', 'kreuzkümmel', 'kurkuma', 'oregano', 'chili', 'curry',
  'muskat', 'kardamom', 'nelke', 'paprikapulver', 'chilipulver',
  'korianderpulver', 'knoblauchpulver', 'zwiebelpulver', 'currypulver',
  'backpulver', 'natron', 'hefe', 'gelatine', 'agar',
  'ras el hanout', 'ras el habout', 'garam masala', 'harissa', 'chilipaste',
  // ── German nuts, seeds, fats ──
  'mandel', 'walnuss', 'haselnuss', 'cashew', 'erdnuss', 'pinienkerne',
  'sesam', 'sonnenblumenkerne', 'kürbiskerne', 'leinsamen', 'chiasamen',
  'fett', 'pflanzenfett', 'kokosfett', 'schmalz', 'butterschmalz',
  // ── Danish oils, vinegars, sauces ──
  'olie', 'olivenolie', 'solsikkeolie', 'rapsolie', 'sesamolie', 'kokosolie',
  'eddike', 'balsamico', 'æblecidereddike', 'sauce', 'ketchup', 'sennep',
  'mayo', 'mayonnaise', 'soja', 'sojasovs', 'pesto', 'tomatpuré', 'tomatpure',
  'sriracha', 'tabasco', 'worcestershire', 'miso', 'fiskesauce', 'østerssauce',
  // ── Danish sweeteners, spreads ──
  'salt', 'peber', 'sukker', 'flormelis', 'rørsukker', 'honning', 'ahornsirup',
  'marmelade', 'peanutbutter', 'chokolade', 'kakao', 'vanilje',
  // ── Danish grains, pulses, canned ──
  'ris', 'couscous', 'quinoa', 'havregryn', 'müsli', 'bønne', 'bønner',
  'linse', 'linser', 'kikært', 'kikærter', 'dåse', 'rosin', 'rosiner',
  'tranebær', 'tørret frugt',
  // ── Danish spices & baking ──
  'krydderi', 'kanel', 'spidskommen', 'gurkemeje', 'chili', 'karry',
  'muskatnød', 'kardemomme', 'nellike', 'paprikapulver', 'korianderpulver',
  'bagepulver', 'natron', 'gær',
  // ── Danish nuts & seeds ──
  'mandel', 'mandler', 'valnød', 'valnødder', 'hasselnød', 'hasselnødder',
  'cashew', 'jordnød', 'jordnødder', 'pinjekerne', 'pinjekerner',
  'sesamfrø', 'solsikkekerne', 'solsikkekerner', 'græskarkerne',
  'græskarkerner', 'hørfrø', 'chiafrø',
]

const BEVERAGE_KEYWORDS = [
  // ── English ──
  'water', 'sparkling water', 'juice', 'wine', 'beer', 'soda', 'lemonade',
  'coffee', 'tea', 'smoothie', 'energy drink', 'coconut water',
  'apple juice', 'orange juice', 'grape juice',
  'espresso', 'cappuccino', 'latte',
  // ── German ──
  'wasser', 'mineralwasser', 'sprudel', 'leitungswasser',
  'saft', 'apfelsaft', 'orangensaft', 'traubensaft', 'tomatensaft',
  'wein', 'rotwein', 'weißwein', 'rosé', 'sekt', 'prosecco', 'champagner',
  'bier', 'malzbier', 'radler',
  'limonade', 'cola', 'kaffee', 'tee', 'kakao', 'smoothie',
  'kräutertee', 'früchtetee', 'grüntee', 'schwarztee', 'pfefferminztee',
  'espresso',
  // ── Danish ──
  'vand', 'danskvand', 'kildevand', 'saft', 'juice', 'æblejuice',
  'appelsinjuice', 'druesaft', 'vin', 'rødvin', 'hvidvin', 'rosé',
  'øl', 'sodavand', 'limonade', 'cola', 'kaffe', 'te', 'kakao',
  'smoothie', 'energidrik', 'espresso',
]

export function categorize(name: string): string {
  const n = name.toLowerCase()

  // 1. Priority-pantry: stocks/broths and spice-powder compounds that would
  //    otherwise be stolen by produce (e.g. Gemüsebrühe → 'gemüse' → produce)
  if (EARLY_PANTRY_KEYWORDS.some(k => n.includes(k))) return 'pantry'

  // 2. Frozen
  if (FROZEN_KEYWORDS.some(k => n.includes(k))) return 'frozen'

  // 3. Produce (before bakery so 'Kartoffel, mehligkochend' → produce not bakery)
  if (PRODUCE_KEYWORDS.some(k => n.includes(k))) return 'produce'

  // 4. Bakery (after produce; flammkuchen/teig keywords catch before meat sees 'lamm')
  if (BAKERY_KEYWORDS.some(k => n.includes(k))) return 'bakery'

  // 5. Meat
  if (MEAT_KEYWORDS.some(k => n.includes(k))) return 'meat'

  // 6. Dairy — 'ei' uses word-boundary regex to avoid false positives in
  //    words like 'kleine', 'keine', 'freie', etc.
  if (DAIRY_KEYWORDS.some(k => n.includes(k))) return 'dairy'
  if (/\bei\b/.test(n)) return 'dairy'

  // 7. Pantry
  if (PANTRY_KEYWORDS.some(k => n.includes(k))) return 'pantry'

  // 8. Beverages
  if (BEVERAGE_KEYWORDS.some(k => n.includes(k))) return 'beverages'

  return 'other'
}
