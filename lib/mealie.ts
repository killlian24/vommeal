import type { Ingredient, Instruction } from './db'
import { getMealieConfig } from './config'
import { normalizeIngredient, normalizeInstructions } from './ingredients'
import { randomUUID } from 'crypto'

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

// undici only says "fetch failed"; the useful part (ECONNREFUSED, EHOSTUNREACH,
// ETIMEDOUT, certificate errors) sits in error.cause.
export function describeFetchError(e: unknown): string {
  if (!(e instanceof Error)) return String(e)
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return 'Zeitüberschreitung'
  const cause = (e as Error & { cause?: { code?: string; message?: string } }).cause
  const code = cause?.code
  const hints: Record<string, string> = {
    ECONNREFUSED: 'Verbindung abgelehnt (falscher Port oder Dienst läuft nicht)',
    EHOSTUNREACH: 'Adresse nicht erreichbar (Container kommt nicht dorthin; NAS-Firewall und Docker-Subnetz prüfen)',
    ENETUNREACH: 'Netzwerk vom Container aus nicht erreichbar',
    ETIMEDOUT: 'Zeitüberschreitung (blockiert eine Firewall?)',
    ENOTFOUND: 'Hostname im Container nicht auflösbar',
    CERT_HAS_EXPIRED: 'TLS-Zertifikat abgelaufen',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'selbstsigniertes Zertifikat abgelehnt; die http-LAN-Adresse verwenden',
    ERR_TLS_CERT_ALTNAME_INVALID: 'TLS-Zertifikat passt nicht zum Hostnamen',
  }
  if (code) return `${code}: ${hints[code] ?? cause?.message ?? ''}`.replace(/: $/, '')
  return cause?.message ? `${e.message} (${cause.message})` : e.message
}

/** Mealie answered with a non-2xx status. */
export class MealieHttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'MealieHttpError'
    this.status = status
  }
}

/** Mealie could not be reached at all (network error or timeout). */
export class MealieUnreachableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MealieUnreachableError'
  }
}

async function mealieRequest<T>(method: string, path: string, body?: unknown, timeoutMs = 15000): Promise<T> {
  const config = getMealieConfig()
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
    throw new MealieUnreachableError(`Mealie nicht erreichbar unter ${url}: ${describeFetchError(e)}`)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new MealieHttpError(`Mealie ${res.status} on ${method} ${path}${text ? ': ' + text.slice(0, 200) : ''}`, res.status)
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
    // Mealie may deliver unparsed ingredients (quantity 0, food/unit null, the
    // whole line in display + note). normalizeIngredient parses those lines
    // and drops redundant notes.
    ingredients: r.recipeIngredient?.map(ing => normalizeIngredient({
      amount: ing.quantity,
      unit: ing.unit?.abbreviation || ing.unit?.name || '',
      name: ing.food?.name || '',
      note: ing.note,
    }, ing.display)) || [],
    // A single instruction containing ",1. … ,2. …" is a merged step list.
    instructions: normalizeInstructions(r.recipeInstructions?.map(i => ({ text: i.text })) || []),
    image_url: r.image
      ? `${getMealieConfig()?.baseUrl}/api/media/recipes/${r.id}/images/original.webp`
      : '',
    rating: r.rating ?? null,
  }
}

export async function updateMealieRating(slug: string, rating: number | null, mealieId?: string | null): Promise<void> {
  // Mealie v1 stores ratings per-user via PUT /api/users/ratings/{recipe_uuid}
  // The recipe body's `rating` field is read-only (aggregated average).
  const ratingValue = rating ?? 0

  const config = getMealieConfig()
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

/**
 * Let Mealie scrape a recipe web page and create the recipe.
 * Mealie v3: POST /api/recipes/create/url {url, includeTags, includeCategories}
 * answers 201 with the new recipe's slug as a JSON string.
 */
export async function importMealieRecipeFromUrl(url: string): Promise<string> {
  const slug = await mealieRequest<unknown>(
    'POST',
    '/recipes/create/url',
    { url, includeTags: true, includeCategories: true },
    90000,  // scraping a slow site can take a while
  )
  if (typeof slug !== 'string' || !slug.trim()) {
    throw new Error('Mealie returned no recipe slug')
  }
  return slug.trim()
}

export type NewMealieRecipe = {
  name: string
  description?: string
  ingredients?: string[]
  instructions?: string[]
  categoryName?: string
}

/**
 * Create a recipe in Mealie from Vommeal. Mealie creates it with just a name
 * (POST /recipes → slug); category, ingredient lines and steps are then set
 * on the full recipe object and written back with PUT. Ingredient lines are
 * stored as free-text notes, which is what Mealie does for unparsed lines.
 * Returns the slug. If the second step fails the recipe still exists in
 * Mealie with its name, so the error is logged and the slug returned.
 */
export async function createMealieRecipe(input: NewMealieRecipe): Promise<string> {
  const slug = await mealieRequest<unknown>('POST', '/recipes', { name: input.name })
  if (typeof slug !== 'string' || !slug.trim()) throw new Error('Mealie returned no recipe slug')
  const cleanSlug = slug.trim()

  const ingredients = (input.ingredients ?? []).map(l => l.trim()).filter(Boolean)
  const steps = (input.instructions ?? []).map(l => l.trim()).filter(Boolean)
  const categoryName = input.categoryName?.trim()
  const description = input.description?.trim()
  if (ingredients.length === 0 && steps.length === 0 && !categoryName && !description) return cleanSlug

  try {
    const recipe = await mealieRequest<Record<string, unknown>>('GET', `/recipes/${cleanSlug}`)
    if (categoryName) {
      const cats = await mealieGet<{ items?: { id: string; name: string; slug: string }[] }>(
        '/organizers/categories?page=1&perPage=200'
      )
      const cat = cats.items?.find(c => c.name.toLowerCase() === categoryName.toLowerCase())
      if (cat) recipe.recipeCategory = [{ id: cat.id, name: cat.name, slug: cat.slug }]
    }
    if (description) recipe.description = description
    if (ingredients.length > 0) {
      recipe.recipeIngredient = ingredients.map(line => ({
        quantity: null, unit: null, food: null,
        note: line, display: line, originalText: line,
        referenceId: randomUUID(),
      }))
    }
    if (steps.length > 0) {
      recipe.recipeInstructions = steps.map(text => ({
        id: randomUUID(), title: '', text, ingredientReferences: [],
      }))
    }
    await mealieRequest('PUT', `/recipes/${cleanSlug}`, recipe)
  } catch (e) {
    console.error('[mealie create] details not saved for', cleanSlug, String(e))
  }
  return cleanSlug
}

export function getMealieRecipeUrl(slug: string): string {
  const config = getMealieConfig()
  if (!config) return ''
  return `${config.baseUrl}/g/home/r/${slug}`
}

export function isMealieConfigured(): boolean {
  return getMealieConfig() !== null
}
