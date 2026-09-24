import { syncMealieRecipes } from '@/lib/mealieSync'

// Streams sync progress as server-sent events; the sync itself lives in
// lib/mealieSync.ts (shared with the nightly scheduler job).
export async function POST() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { /* client went away; the sync keeps running */ }
      }

      try {
        await syncMealieRecipes(send)
      } catch (e) {
        send({ status: 'error', error: String(e) })
      }

      try { controller.close() } catch { /* already closed */ }
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
