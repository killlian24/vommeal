/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * https://nextjs.org/docs/app/guides/instrumentation
 *
 * Only the Node.js runtime can touch SQLite, so everything is guarded by
 * NEXT_RUNTIME and imported lazily (the file is also evaluated for the edge
 * runtime, where better-sqlite3 must never be loaded).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { scheduleBackups } = await import('./lib/backup')
  scheduleBackups()
}
