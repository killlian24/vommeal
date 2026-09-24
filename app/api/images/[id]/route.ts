import { NextRequest, NextResponse } from 'next/server'
import { getRecipeImage, ImageNotFoundError } from '@/lib/images'

// Recipe image proxy; see lib/images.ts.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const image = await getRecipeImage(id)
    return new NextResponse(new Uint8Array(image.body), {
      headers: {
        'Content-Type': image.contentType,
        'Content-Length': String(image.body.length),
        'Cache-Control': 'public, max-age=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e) {
    if (e instanceof ImageNotFoundError) {
      return NextResponse.json({ error: 'Kein Bild vorhanden' }, { status: 404 })
    }
    console.error(`[images] ${id}: ${e instanceof Error ? e.message : String(e)}`)
    return NextResponse.json({ error: 'Bild konnte nicht geladen werden' }, { status: 502 })
  }
}
