import { randomUUID } from 'crypto'
import { fetchMealieRecipeSlugs, fetchMealieRecipeDetail, fetchMealieSlugsForCategory } from './mealie'
import { upsertRecipe, getAllRecipes, getRecipeByMealieId, getSetting, deleteRecipe } from './db'
import type { Recipe } from './db'

/**
 * Mealie → Vommeal recipe sync, shared by the streaming route
 * (app/api/mealie/sync) and the nightly scheduler job.
 *
 * Local-only fields (effort) are preserved by upsertRecipe.
 */

export type MealieSyncProgress =
  | { status: 'listing'; message: string }
  | { status: 'syncing'; total: number; synced: number; message?: string; current?: string; errors?: number }
  | ({ status: 'done' } & MealieSyncResult)
  | { status: 'error'; error: string }

export type MealieSyncResult = {
  total: number
  synced: number
  created: number
  errors: number
  failed: { slug: string; error: string }[]
  /** Local Mealie recipes removed because Mealie no longer lists them */
  removed: number
  removedNames: string[]
  /** Set when removal was skipped by the safety check */
  removalSkipped?: string
}

type MealieDetail = Awaited<ReturnType<typeof fetchMealieRecipeDetail>>

/** Store one Mealie recipe locally, reusing the local id when it already exists. */
export function upsertMealieDetail(mr: MealieDetail, existingId?: string): Recipe {
  const id = existingId || getRecipeByMealieId(mr.mealie_id)?.id || randomUUID()
  return upsertRecipe({
    id,
    name: mr.name,
    description: mr.description,
    tags: mr.tags,
    servings: mr.servings,
    prep_time: mr.prep_time,
    cook_time: mr.cook_time,
    ingredients: mr.ingredients,
    instructions: mr.instructions,
    image_url: mr.image_url,
    mealie_id: mr.mealie_id,
    mealie_slug: mr.mealie_slug,
    source: 'mealie',
    rating: mr.rating,
  })
}

let running: Promise<MealieSyncResult> | null = null

export function isMealieSyncRunning(): boolean {
  return running !== null
}

/**
 * Pull all (or all dinner-category) recipes from Mealie. A second call while
 * a sync is running waits for the running one instead of starting another.
 * Throws when the recipe list cannot be fetched; per-recipe failures are
 * counted in the result.
 */
export function syncMealieRecipes(onProgress: (p: MealieSyncProgress) => void = () => {}): Promise<MealieSyncResult> {
  if (running) {
    onProgress({ status: 'listing', message: 'A sync is already running, waiting for it…' })
    return running.then(result => {
      onProgress({ status: 'done', ...result })
      return result
    })
  }
  running = runSync(onProgress).finally(() => { running = null })
  return running
}

async function runSync(onProgress: (p: MealieSyncProgress) => void): Promise<MealieSyncResult> {
  const dinnerCategory = getSetting('dinner_category') || ''
  const filterMsg = dinnerCategory ? ` in category "${dinnerCategory}"` : ''
  onProgress({ status: 'listing', message: `Fetching recipe list from Mealie${filterMsg}…` })

  const slugs = dinnerCategory
    ? await fetchMealieSlugsForCategory(dinnerCategory)
    : await fetchMealieRecipeSlugs()
  const total = slugs.length

  onProgress({ status: 'syncing', total, synced: 0, message: `Found ${total} recipes${filterMsg}` })

  const existingByMealieId = new Map(
    getAllRecipes().filter(r => r.mealie_id).map(r => [r.mealie_id!, r])
  )

  const seenMealieIds = new Set<string>()
  let synced = 0
  let created = 0
  let errors = 0
  const failed: { slug: string; error: string }[] = []

  for (const slug of slugs) {
    try {
      const mr = await fetchMealieRecipeDetail(slug)
      const existingRecipe = existingByMealieId.get(mr.mealie_id)
      upsertMealieDetail(mr, existingRecipe?.id)
      seenMealieIds.add(mr.mealie_id)
      if (existingRecipe) { synced++ } else { created++ }
    } catch (e) {
      errors++
      if (failed.length < 20) {
        failed.push({ slug, error: e instanceof Error ? e.message : String(e) })
      }
    }

    onProgress({ status: 'syncing', total, synced: synced + created, current: slug, errors })
  }

  const removal = removeVanishedRecipes(new Set(slugs), seenMealieIds)
  const result = { total, synced, created, errors, failed, ...removal }
  onProgress({ status: 'done', ...result })
  return result
}

/**
 * Mirror deletions: drop local Mealie recipes that Mealie no longer lists
 * (deleted there, or removed from the dinner category). Safety stop: nothing
 * is removed when Mealie listed no recipes at all, or when more than half of
 * the local Mealie recipes (and more than 3) would go — that smells like a
 * misconfiguration rather than a real clean-up.
 */
export function removeVanishedRecipes(
  listedSlugs: Set<string>,
  seenMealieIds: Set<string>,
): Pick<MealieSyncResult, 'removed' | 'removedNames' | 'removalSkipped'> {
  const local = getAllRecipes().filter(r => r.source === 'mealie')
  const vanished = local.filter(r =>
    !(r.mealie_slug && listedSlugs.has(r.mealie_slug)) &&
    !(r.mealie_id && seenMealieIds.has(r.mealie_id))
  )
  if (vanished.length === 0) return { removed: 0, removedNames: [] }
  if (listedSlugs.size === 0) {
    return { removed: 0, removedNames: [], removalSkipped: 'Mealie hat keine Rezepte geliefert – nichts gelöscht' }
  }
  if (vanished.length > 3 && vanished.length > local.length / 2) {
    return {
      removed: 0, removedNames: [],
      removalSkipped: `${vanished.length} Rezepte fehlen in Mealie – zur Sicherheit nichts gelöscht`,
    }
  }
  for (const r of vanished) deleteRecipe(r.id)
  return { removed: vanished.length, removedNames: vanished.map(r => r.name) }
}
