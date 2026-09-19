import { NextRequest, NextResponse } from 'next/server'
import type { Ingredient, Instruction } from './db'

/**
 * Small, dependency-free request validation helpers for the API routes.
 *
 * Every `require*` / `optional*` helper throws a ValidationError on bad
 * input. Route handlers wrap their body in `try { … } catch (e) { return
 * errorResponse(e) }`, which turns a ValidationError into a 400 with a short
 * message and re-throws anything else.
 */

export class ValidationError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ValidationError'
    this.status = status
  }
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ValidationError) {
    return NextResponse.json({ error: e.message }, { status: e.status })
  }
  throw e
}

export const MAX_SERVINGS = 50
export const MEAL_PLAN_STATUSES = ['suggested', 'approved'] as const
export type MealPlanStatus = (typeof MEAL_PLAN_STATUSES)[number]

// Common string length limits
export const LIMITS = {
  id: 64,
  name: 200,
  userName: 100,
  notes: 1000,
  description: 5000,
  tag: 50,
  url: 2048,
  ingredientField: 200,
  instruction: 5000,
  maxTags: 50,
  maxIngredients: 200,
  maxInstructions: 200,
  maxMinutes: 10000,
} as const

type JsonObject = Record<string, unknown>

/** Parse the JSON body and make sure it is a plain object. */
export async function readJsonObject(req: NextRequest): Promise<JsonObject> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new ValidationError('Request body must be valid JSON')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object')
  }
  return body as JsonObject
}

// --- Dates ---

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** True for `YYYY-MM-DD` strings that denote a real calendar day. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const m = ISO_DATE_RE.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

export function requireIsoDate(value: unknown, field = 'date'): string {
  if (!isIsoDate(value)) throw new ValidationError(`${field} must be a valid date in YYYY-MM-DD format`)
  return value
}

/** Validate a `start`/`end` query pair and make sure start <= end. */
export function requireDateRange(searchParams: URLSearchParams): { start: string; end: string } {
  const rawStart = searchParams.get('start')
  const rawEnd = searchParams.get('end')
  if (!rawStart || !rawEnd) throw new ValidationError('start and end required')
  const start = requireIsoDate(rawStart, 'start')
  const end = requireIsoDate(rawEnd, 'end')
  if (start > end) throw new ValidationError('start must not be after end')
  return { start, end }
}

// --- Numbers ---

function toInteger(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim())
  return null
}

export function requireServings(value: unknown, field = 'servings'): number {
  const n = toInteger(value)
  if (n === null || n < 1 || n > MAX_SERVINGS) {
    throw new ValidationError(`${field} must be a whole number between 1 and ${MAX_SERVINGS}`)
  }
  return n
}

/** Missing (undefined/null) falls back to `fallback`; anything else is validated. */
export function optionalServings(value: unknown, fallback: number, field = 'servings'): number {
  if (value === undefined || value === null) return fallback
  return requireServings(value, field)
}

/** Non-negative integer with an upper bound (minutes, counts, ...). */
export function optionalNonNegativeInt(value: unknown, fallback: number, field: string, max = LIMITS.maxMinutes): number {
  if (value === undefined || value === null || value === '') return fallback
  const n = toInteger(value)
  if (n === null || n < 0 || n > max) {
    throw new ValidationError(`${field} must be a whole number between 0 and ${max}`)
  }
  return n
}

/** Rating: null clears, otherwise an integer 0..5. */
export function optionalRating(value: unknown, field = 'rating'): number | null {
  if (value === undefined || value === null) return null
  const n = toInteger(value)
  if (n === null || n < 0 || n > 5) throw new ValidationError(`${field} must be a whole number between 0 and 5 or null`)
  return n
}

// --- Strings ---

/** Required, non-empty after trimming, at most `maxLen` characters. */
export function requireString(value: unknown, field: string, maxLen: number): string {
  if (typeof value !== 'string') throw new ValidationError(`${field} is required`)
  const trimmed = value.trim()
  if (!trimmed) throw new ValidationError(`${field} is required`)
  if (trimmed.length > maxLen) throw new ValidationError(`${field} must be at most ${maxLen} characters`)
  return trimmed
}

/**
 * Optional string: undefined/null return `fallback`; strings are trimmed
 * (empty allowed) and length-limited; other types are rejected.
 */
export function optionalString(value: unknown, field: string, maxLen: number, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`)
  const trimmed = value.trim()
  if (trimmed.length > maxLen) throw new ValidationError(`${field} must be at most ${maxLen} characters`)
  return trimmed
}

/** Optional string that keeps `null` for missing or empty values. */
export function optionalNullableString(value: unknown, field: string, maxLen: number): string | null {
  const s = optionalString(value, field, maxLen, '')
  return s || null
}

export function requireStatus(value: unknown, field = 'status'): MealPlanStatus {
  if (typeof value !== 'string' || !(MEAL_PLAN_STATUSES as readonly string[]).includes(value)) {
    throw new ValidationError(`${field} must be one of: ${MEAL_PLAN_STATUSES.join(', ')}`)
  }
  return value as MealPlanStatus
}

export function optionalStatus(value: unknown, fallback: MealPlanStatus, field = 'status'): MealPlanStatus {
  if (value === undefined || value === null) return fallback
  return requireStatus(value, field)
}

// --- Recipes ---

/** Client-editable recipe fields. `id`, `source` and `mealie_id` are never taken from the client. */
export type RecipeInput = {
  name: string
  description: string
  tags: string[]
  servings: number
  prep_time: number
  cook_time: number
  ingredients: Ingredient[]
  instructions: Instruction[]
  image_url: string
  mealie_slug: string | null
  rating: number | null
}

/**
 * Pick and validate the known recipe fields from a request body. Fields that
 * are absent (undefined) are left out so PUT can fall back to stored values;
 * `name` is always required.
 */
export function parseRecipeInput(body: JsonObject): Partial<RecipeInput> & { name: string } {
  const out: Partial<RecipeInput> & { name: string } = {
    name: requireString(body.name, 'name', LIMITS.name),
  }
  if (body.description !== undefined) out.description = optionalString(body.description, 'description', LIMITS.description)
  if (body.tags !== undefined) out.tags = optionalStringArray(body.tags, 'tags', LIMITS.maxTags, LIMITS.tag)
  if (body.servings !== undefined) out.servings = optionalServings(body.servings, 4)
  if (body.prep_time !== undefined) out.prep_time = optionalNonNegativeInt(body.prep_time, 0, 'prep_time')
  if (body.cook_time !== undefined) out.cook_time = optionalNonNegativeInt(body.cook_time, 0, 'cook_time')
  if (body.ingredients !== undefined) {
    out.ingredients = optionalObjectArray(body.ingredients, 'ingredients', LIMITS.maxIngredients, (item, i) => {
      const ing: Ingredient = {
        amount: optionalString(item.amount, `ingredients[${i}].amount`, LIMITS.ingredientField),
        unit: optionalString(item.unit, `ingredients[${i}].unit`, LIMITS.ingredientField),
        name: optionalString(item.name, `ingredients[${i}].name`, LIMITS.ingredientField),
      }
      const note = optionalString(item.note, `ingredients[${i}].note`, LIMITS.ingredientField)
      if (note) ing.note = note
      return ing
    })
  }
  if (body.instructions !== undefined) {
    out.instructions = optionalObjectArray(body.instructions, 'instructions', LIMITS.maxInstructions, (item, i) => ({
      text: optionalString(item.text, `instructions[${i}].text`, LIMITS.instruction),
    }))
  }
  if (body.image_url !== undefined) out.image_url = optionalString(body.image_url, 'image_url', LIMITS.url)
  if (body.mealie_slug !== undefined) out.mealie_slug = optionalNullableString(body.mealie_slug, 'mealie_slug', LIMITS.name)
  if (body.rating !== undefined) out.rating = optionalRating(body.rating)
  return out
}

// --- Arrays ---

/** Array of non-empty trimmed strings (used for recipe tags). */
export function optionalStringArray(value: unknown, field: string, maxItems: number, maxLen: number): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be an array of strings`)
  if (value.length > maxItems) throw new ValidationError(`${field} must have at most ${maxItems} entries`)
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') throw new ValidationError(`${field} must be an array of strings`)
    const trimmed = item.trim()
    if (!trimmed) continue
    if (trimmed.length > maxLen) throw new ValidationError(`${field} entries must be at most ${maxLen} characters`)
    out.push(trimmed)
  }
  return out
}

/** Array of plain objects; each is validated by `parseItem`. */
export function optionalObjectArray<T>(
  value: unknown,
  field: string,
  maxItems: number,
  parseItem: (item: JsonObject, index: number) => T,
): T[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be an array`)
  if (value.length > maxItems) throw new ValidationError(`${field} must have at most ${maxItems} entries`)
  return value.map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ValidationError(`${field}[${i}] must be an object`)
    }
    return parseItem(item as JsonObject, i)
  })
}
