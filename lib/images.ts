import fs from 'fs'
import path from 'path'
import { getDbPath, getRecipeImageSource } from './db'
import { getMealieConfig } from './config'
import { describeFetchError } from './mealie'

/**
 * Same-origin image proxy for recipe images (GET /api/images/<id>).
 *
 * Recipes store the upstream URL (usually Mealie's original.webp on the LAN).
 * Phones away from home only reach Vommeal over Tailscale, not Mealie, so the
 * server fetches the image once, keeps it under
 * `${DATA_DIR}/cache/images/<id>.webp` and serves it from there. Entries are
 * refreshed after CACHE_MAX_AGE_MS; if the refresh fails the stale copy is
 * served. A small `<id>.src` sidecar remembers which URL the file came from,
 * so a changed image URL is fetched again right away.
 */

export const IMAGE_CACHE_DIR = path.join(path.dirname(getDbPath()), 'cache', 'images')
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15000

export type CachedImage = { body: Buffer; contentType: string }

export class ImageNotFoundError extends Error {}

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

/** Detect the image type from its first bytes (cache files are always named .webp). */
export function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString('ascii', 0, 6))) return 'image/gif'
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp' && /^avi[fs]$/.test(buf.toString('ascii', 8, 12))) return 'image/avif'
  if (buf.length >= 5 && /^\s*<(\?xml|svg)/i.test(buf.toString('utf8', 0, Math.min(buf.length, 100)))) return 'image/svg+xml'
  return null
}

/**
 * Mealie image URLs are stored with the Mealie base URL of sync time. If the
 * Mealie address changed since, point them at the current one.
 */
export function resolveImageSource(stored: string, mealieBaseUrl: string | null): string {
  if (!mealieBaseUrl) return stored
  const m = /^https?:\/\/[^/]+(?:\/.*?)?(\/api\/media\/recipes\/[^#]+)$/i.exec(stored)
  if (!m) return stored
  return `${mealieBaseUrl}${m[1]}`
}

function cachePaths(id: string) {
  return {
    file: path.join(IMAGE_CACHE_DIR, `${id}.webp`),
    src: path.join(IMAGE_CACHE_DIR, `${id}.src`),
  }
}

function readCache(id: string, source: string): { image: CachedImage; fresh: boolean } | null {
  const { file, src } = cachePaths(id)
  try {
    const stat = fs.statSync(file)
    const cachedSource = fs.existsSync(src) ? fs.readFileSync(src, 'utf8') : source
    const body = fs.readFileSync(file)
    const contentType = sniffImageType(body)
    if (!contentType) return null
    const fresh = cachedSource === source && Date.now() - stat.mtimeMs < CACHE_MAX_AGE_MS
    return { image: { body, contentType }, fresh }
  } catch {
    return null
  }
}

async function download(source: string): Promise<CachedImage> {
  const mealie = getMealieConfig()
  const headers: Record<string, string> = { Accept: 'image/*' }
  // Only ever send the Mealie token to Mealie itself.
  if (mealie && source.startsWith(`${mealie.baseUrl}/`)) headers.Authorization = `Bearer ${mealie.apiToken}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    let res: Response
    try {
      res = await fetch(source, { headers, cache: 'no-store', signal: controller.signal })
    } catch (e) {
      throw new Error(`Bild nicht erreichbar: ${describeFetchError(e)}`)
    }
    if (res.status === 404) throw new ImageNotFoundError('Bild nicht gefunden')
    if (!res.ok) throw new Error(`Bildquelle antwortete mit ${res.status}`)
    const declared = Number(res.headers.get('content-length') || 0)
    if (declared > MAX_IMAGE_BYTES) throw new Error('Bild ist zu groß')
    const body = Buffer.from(await res.arrayBuffer())
    if (body.length > MAX_IMAGE_BYTES) throw new Error('Bild ist zu groß')
    const contentType = sniffImageType(body)
    if (!contentType) throw new Error('Antwort ist kein Bild')
    return { body, contentType }
  } finally {
    clearTimeout(timer)
  }
}

function writeCache(id: string, source: string, image: CachedImage) {
  const { file, src } = cachePaths(id)
  fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, image.body)
  fs.renameSync(tmp, file)
  fs.writeFileSync(src, source)
}

const inFlight = new Map<string, Promise<CachedImage>>()

/**
 * Return the image for a recipe, from cache or freshly downloaded.
 * Throws ImageNotFoundError when the recipe has no (reachable) image.
 */
export async function getRecipeImage(id: string): Promise<CachedImage> {
  if (!SAFE_ID_RE.test(id)) throw new ImageNotFoundError('Ungültige ID')
  const stored = getRecipeImageSource(id)
  if (!stored || !/^https?:\/\//i.test(stored)) throw new ImageNotFoundError('Kein Bild')
  const source = resolveImageSource(stored, getMealieConfig()?.baseUrl ?? null)

  const cached = readCache(id, source)
  if (cached?.fresh) return cached.image

  let pending = inFlight.get(id)
  if (!pending) {
    pending = download(source)
      .then(image => {
        try { writeCache(id, source, image) } catch (e) { console.error(`[images] cache write failed for ${id}: ${String(e)}`) }
        return image
      })
      .finally(() => inFlight.delete(id))
    inFlight.set(id, pending)
  }

  try {
    return await pending
  } catch (e) {
    if (cached) return cached.image  // stale beats nothing
    throw e
  }
}
