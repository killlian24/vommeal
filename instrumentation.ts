/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * https://nextjs.org/docs/app/guides/instrumentation
 *
 * Only the Node.js runtime can touch SQLite, so everything is guarded by
 * NEXT_RUNTIME and imported lazily (the file is also evaluated for the edge
 * runtime, where better-sqlite3 must never be loaded).
 *
 * - Daily SQLite backups (lib/backup.ts, own 24 h timer).
 * - Scheduler for notifications and the nightly Mealie sync (lib/scheduler.ts);
 *   it only runs in production or with VOMMEAL_SCHEDULER=1.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { scheduleBackups } = await import('./lib/backup')
  scheduleBackups()
  const { startScheduler } = await import('./lib/scheduler')
  startScheduler()
}
