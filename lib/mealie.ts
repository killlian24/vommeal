import { getSetting } from './db'
import type { Ingredient, Instruction } from './db'

export type MealieRecipe = {
  id: string
  name: string
  slug: string
  description: string | null
  prepTime: string | null
  cookTime: string | null
  totalTime: string | null
  recipeYield: string | null
  recipeCategory: unknown[]
  tags: { name: string }[]
  tools: unknown[]
  recipeIngredient: {
    quantity: number | null
    unit: { name: string; abbreviation: string } | null
    food: { name: string } | null
    note: string | null
    display: string
  }[]
  recipeInstructions: { text: string }[]
  image: string | null
  rating: number | null
  [key: string]: unknown  // allow any other fields Mealie returns
}

export type MealieConfig = {
  baseUrl: string
  apiToken: string
}

function sanitizeUrl(raw: string): string {
  // Fix accidental double-protocol (e.g. "https:https://...")
  raw = raw.replace(/^https?:https?:\/\//, 'https://')
  // Ensure it starts with a protocol
  if (raw && !raw.startsWith('http')) raw = 'https://' + raw
  // Strip trailing slash
  return raw.replace(/\/$/, '')
}

function getConfig(): MealieConfig | null {
  const baseUrl = sanitizeUrl(getSetting('mealie_url') || process.env.MEALIE_URL || '')
  const apiToken = getSetting('mealie_token') || process.env.MEALIE_TOKEN || ''
  if (!baseUrl || !apiToken) return null
  return { baseUrl, apiToken }
}

async function mealieRequest<T>(method: string, path: string, body?: unknown, timeoutMs = 15000): Promise<T> {
  const config = getConfig()
  if (!config) throw new Error('Mealie not configured')

  const url = `${config.baseUrl}/api${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Cannot reach Mealie at ${url}: ${msg}`)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Mealie ${res.status} on ${method} ${path}${text ? ': ' + text.slice(0, 200) : ''}`)
  }
  return res.json()
}

async function mealieGet<T>(path: string, timeoutMs = 15000): Promise<T> {
  return mealieRequest<T>('GET', path, undefined, timeoutMs)
}

export async function testMealieConnection(): Promise<{ ok: boolean; user?: string; error?: string }> {
  try {
    const data = await mealieGet<{ email: string }>('/users/self')
    return { ok: true, user: data.email }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

function parseTime(timeStr: string | null | undefined): number {
  if (!timeStr || timeStr === 'none') return 0
  // ISO 8601: PT1H30M, PT45M
  const iso = timeStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (iso) return (parseInt(iso[1] || '0') * 60) + parseInt(iso[2] || '0')
  // German/plain text: "45 Minuten", "1 Stunde 55 Minuten", "1 Stunde"
  let mins = 0
  const h = timeStr.match(/(\d+)\s*Stunde/)
  const m = timeStr.match(/(\d+)\s*Minute/)
  if (h) mins += parseInt(h[1]) * 60
  if (m) mins += parseInt(m[1])
  return mins
}

export async function fetchMealieSlugsForCategory(categoryName: string): Promise<string[]> {
  // Fetch all categories to find the slug for the given name
  const cats = await mealieGet<{ items: { id: string; name: string; slug: string }[] }>(
    '/organizers/categories?page=1&perPage=100'
  )
  const cat = cats.items?.find(c => c.name.toLowerCase() === categoryName.toLowerCase())
  if (!cat) {
    // Category not found — fall back to all recipes rather than returning nothing
    console.warn(`[Mealie] Category "${categoryName}" not found, falling back to all recipes`)
    return fetchMealieRecipeSlugs()
  }

  // Mealie filters by category slug using the `categories` query param
  let page = 1
  const perPage = 50
  const allSlugs: string[] = []
  while (true) {
    const data = await mealieGet<{
      items: { slug: string }[]
      total_pages: number | null
      page: number
    }>(`/recipes?page=${page}&perPage=${perPage}&categories=${encodeURIComponent(cat.slug)}&orderBy=name&orderDirection=asc`)
    allSlugs.push(...(data.items ?? []).map(r => r.slug))
    if (page >= (data.total_pages ?? 1)) break
    page++
  }
  return allSlugs
}

export async function fetchMealieRecipeSlugs(): Promise<string[]> {
  let page = 1
  const perPage = 50
  const allSlugs: string[] = []

  while (true) {
    const data = await mealieGet<{
      items: { slug: string }[]
      total: number
      page: number
      total_pages: number  // Mealie uses snake_case
    }>(`/recipes?page=${page}&perPage=${perPage}&orderBy=name&orderDirection=asc`)

    allSlugs.push(...(data.items ?? []).map(r => r.slug))
    if (page >= data.total_pages) break
    page++
  }

  return allSlugs
}

export async function fetchMealieRecipeDetail(slug: string): Promise<{
  mealie_id: string; mealie_slug: string; name: string; description: string
  tags: string[]; servings: number; prep_time: number; cook_time: number
  ingredients: Ingredient[]; instructions: Instruction[]; image_url: string
  rating: number | null
}> {
  const r = await mealieGet<MealieRecipe>(`/recipes/${slug}`)
  return {
    mealie_id: r.id,
    mealie_slug: r.slug,
    name: r.name,
    description: r.description || '',
    tags: r.tags?.map(t => t.name) || [],
    servings: parseInt(r.recipeYield || '4') || 4,
    prep_time: parseTime(r.prepTime),
    cook_time: parseTime(r.cookTime),
    ingredients: r.recipeIngredient?.map(ing => ({
      amount: ing.quantity?.toString() || '',
      unit: ing.unit?.abbreviation || ing.unit?.name || '',
      name: ing.food?.name || ing.display || '',
      note: ing.note || undefined,
    })) || [],
    instructions: r.recipeInstructions?.map(i => ({ text: i.text })) || [],
    image_url: r.image
      ? `${getConfig()?.baseUrl}/api/media/recipes/${r.id}/images/original.webp`
      : '',
    rating: r.rating ?? null,
  }
}

export async function updateMealieRating(slug: string, rating: number | null, mealieId?: string | null): Promise<void> {
  // Mealie v1 stores ratings per-user via PUT /api/users/ratings/{recipe_uuid}
  // The recipe body's `rating` field is read-only (aggregated average).
  const ratingValue = rating ?? 0

  const config = getConfig()
  if (!config) throw new Error('Mealie not configured')

  // Primary: use the dedicated user-ratings endpoint (requires recipe UUID)
  if (mealieId) {
    const res = await fetch(`${config.baseUrl}/api/users/ratings/${mealieId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ recipeId: mealieId, rating: ratingValue }),
      cache: 'no-store',
    })
    if (res.ok) return
    // 404/405 means this Mealie version doesn't have this endpoint — fall through
    if (res.status !== 404 && res.status !== 405 && res.status !== 422) {
      const text = await res.text().catch(() => '')
      throw new Error(`Mealie ${res.status} on PUT /api/users/ratings/${mealieId}${text ? ': ' + text.slice(0, 200) : ''}`)
    }
  }

  // Fallback: GET the full recipe and PUT it back with the rating field set
  // (works on older Mealie versions that do store rating in the recipe body)
  const recipe = await mealieRequest<MealieRecipe>('GET', `/recipes/${slug}`)
  await mealieRequest('PUT', `/recipes/${slug}`, { ...recipe, rating: ratingValue })
}

export function getMealieRecipeUrl(slug: string): string {
  const config = getConfig()
  if (!config) return ''
  return `${config.baseUrl}/g/home/r/${slug}`
}

export function isMealieConfigured(): boolean {
  return getConfig() !== null
}
