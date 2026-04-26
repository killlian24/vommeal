import { fetchMealieRecipeSlugs, fetchMealieRecipeDetail, fetchMealieSlugsForCategory } from '@/lib/mealie'
import { upsertRecipe, getAllRecipes, getSetting } from '@/lib/db'
import { randomUUID } from 'crypto'

export async function POST() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const dinnerCategory = getSetting('dinner_category') || ''
        const filterMsg = dinnerCategory ? ` in category "${dinnerCategory}"` : ''
        send({ status: 'listing', message: `Fetching recipe list from Mealie${filterMsg}…` })

        const slugs = dinnerCategory
          ? await fetchMealieSlugsForCategory(dinnerCategory)
          : await fetchMealieRecipeSlugs()
        const total = slugs.length

        send({ status: 'syncing', total, synced: 0, message: `Found ${total} recipes${filterMsg}` })

        const existing = getAllRecipes()
        const existingByMealieId = new Map(
          existing.filter(r => r.mealie_id).map(r => [r.mealie_id!, r])
        )

        let synced = 0
        let created = 0
        let errors = 0
        const failed: { slug: string; error: string }[] = []

        for (const slug of slugs) {
          try {
            const mr = await fetchMealieRecipeDetail(slug)
            const existingRecipe = existingByMealieId.get(mr.mealie_id)
            const id = existingRecipe?.id || randomUUID()

            upsertRecipe({
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

            if (existingRecipe) { synced++ } else { created++ }
          } catch (e) {
            errors++
            if (failed.length < 20) {
              failed.push({ slug, error: e instanceof Error ? e.message : String(e) })
            }
          }

          send({
            status: 'syncing',
            total,
            synced: synced + created,
            current: slug,
            errors,
          })
        }

        send({ status: 'done', total, synced, created, errors, failed })
      } catch (e) {
        send({ status: 'error', error: String(e) })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
