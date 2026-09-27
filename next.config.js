// Changes with every build; the service worker is registered as
// /sw.js?v=<stamp>, so each deploy gets a fresh worker and cache.
const buildStamp = Date.now().toString(36)

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_BUILD_STAMP: buildStamp,
  },
  async headers() {
    return [
      {
        // Browsers must always check for a new worker, never use a stale copy.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
  images: {
    // Only proxy https images to prevent the Next Image optimizer from being
    // used as an SSRF read primitive against internal http services.
    // If your Mealie is on plain http over LAN, recipe images won't load —
    // either serve Mealie on https or add a specific host entry here.
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  serverExternalPackages: ['better-sqlite3'],
}

module.exports = nextConfig
