// Vommeal service worker: lets the installed app open without a connection.
//
// - Pages (navigations): network first, the last good copy when offline.
// - /_next/static/*: cache first. The file names carry a content hash, so a
//   cached file can never be an outdated version of a newer one.
// - Icons and the manifest: stale while revalidate.
// - /api/*, RSC requests and anything else: never cached here. The pages keep
//   their own last state (e.g. the shopping list in localStorage).
//
// Every build registers /sw.js?v=<build stamp>. A new stamp installs a new
// worker with its own cache; the old caches are deleted on activation.

const VERSION = new URL(self.location.href).searchParams.get('v') || 'v1'
const CACHE = `vommeal-${VERSION}`
const SHELL = ['/', '/tonight', '/shopping', '/recipes', '/settings']
const STATIC_FILES = ['/manifest.json', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-180.png']

// Scripts and styles a page needs, taken from its HTML
function assetsOf(html) {
  const found = new Set()
  const re = /\/_next\/static\/[^"'\s)\\]+/g
  let m
  while ((m = re.exec(html))) found.add(m[0])
  return Array.from(found)
}

async function precache() {
  const cache = await caches.open(CACHE)
  await Promise.all(STATIC_FILES.map(url => cache.add(url).catch(() => {})))
  await Promise.all(SHELL.map(async url => {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) return
      const html = await res.clone().text()
      await cache.put(url, res)
      await Promise.all(assetsOf(html).map(a => cache.add(a).catch(() => {})))
    } catch { /* offline during install: cached on the next visit */ }
  }))
}

self.addEventListener('install', event => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => k.startsWith('vommeal-') && k !== CACHE).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

// A connection that hangs (weak signal in the supermarket) falls back to the
// cached page after this long; the network answer still updates the cache.
const NAV_TIMEOUT_MS = 4000

async function cachedPage(request) {
  const cache = await caches.open(CACHE)
  return (await cache.match(new URL(request.url).pathname)) || (await cache.match(request, { ignoreSearch: true }))
}

async function networkFirstPage(request) {
  const network = fetch(request).then(res => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone()
      caches.open(CACHE).then(cache => cache.put(new URL(request.url).pathname, copy)).catch(() => {})
    }
    return res
  })
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAV_TIMEOUT_MS))
    return await Promise.race([network, timeout])
  } catch {
    const hit = await cachedPage(request)
    if (hit) { network.catch(() => {}); return hit }
    // Nothing cached: keep waiting for the network if it is only slow
    try { return await network } catch { /* offline */ }
    return new Response(
      '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Vommeal</title><body style="background:#0a0a0a;color:#ddd;font-family:system-ui;padding:2rem">' +
      '<h1 style="font-size:1.25rem">Keine Verbindung</h1><p>Diese Seite ist offline nicht gespeichert. ' +
      '<a href="/shopping" style="color:#f97316">Zur Einkaufsliste</a></p></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok && res.type === 'basic') cache.put(request, res.clone()).catch(() => {})
  return res
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  const fresh = fetch(request).then(res => {
    if (res.ok && res.type === 'basic') cache.put(request, res.clone()).catch(() => {})
    return res
  })
  if (hit) { fresh.catch(() => {}); return hit }
  return fresh
}

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  // Client-side navigation data (React Server Components): leave to Next.js
  if (request.headers.get('RSC') || url.searchParams.has('_rsc')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request))
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request))
  } else if (url.pathname === '/manifest.json' || url.pathname.startsWith('/icons/')) {
    event.respondWith(staleWhileRevalidate(request))
  }
})
