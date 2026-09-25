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
 * - Listener for taps on notification buttons (lib/haEvents.ts), same gate as
 *   the scheduler; connects only while HA and notify devices are set up.
 */
export async function register() {
  // Written as `if (=== 'nodejs') { … }` (not an early return) so the bundler
  // drops these imports from the edge build entirely.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { scheduleBackups } = await import('./lib/backup')
    scheduleBackups()
    const { startScheduler } = await import('./lib/scheduler')
    startScheduler()
    const { startHaEvents } = await import('./lib/haEvents')
    await startHaEvents().catch(e => console.error(`[ha-events] start failed: ${String(e)}`))
  }
}
