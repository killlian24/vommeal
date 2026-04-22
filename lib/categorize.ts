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

export function categorize(name: string): string {
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
