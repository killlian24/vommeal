/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
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
