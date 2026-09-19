import fs from 'fs'
import path from 'path'
import { getDb, getDbPath } from './db'

/**
 * Daily SQLite backups via better-sqlite3's online backup API.
 *
 * Files land in `${DATA_DIR}/backups/vommeal-YYYY-MM-DD.db` (next to the live
 * database, see getDbPath()). One backup per calendar day is kept (a second
 * run on the same day is a no-op) and files older than RETENTION_DAYS are
 * removed. Scheduling lives in `instrumentation.ts`, which calls
 * `scheduleBackups()` on server start. The manual download endpoint in
 * `app/api/backup/route.ts` is independent of this.
 */

export const BACKUP_DIR = path.join(path.dirname(getDbPath()), 'backups')
export const RETENTION_DAYS = 14

const BACKUP_FILE_RE = /^vommeal-(\d{4}-\d{2}-\d{2})\.db$/
const INITIAL_DELAY_MS = 30 * 1000
const INTERVAL_MS = 24 * 60 * 60 * 1000

export type BackupResult = {
  file: string
  created: boolean
  deleted: string[]
}

function localDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Create today's backup (if missing) and prune old ones. */
export async function runBackup(now = new Date()): Promise<BackupResult> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })

  const today = localDateString(now)
  const file = path.join(BACKUP_DIR, `vommeal-${today}.db`)
  let created = false

  if (!fs.existsSync(file)) {
    // Write to a temp name first so a crash mid-copy never leaves a truncated
    // file that would be mistaken for a finished backup.
    const tmp = `${file}.tmp-${process.pid}`
    try {
      await getDb().backup(tmp)
      fs.renameSync(tmp, file)
      created = true
    } catch (e) {
      fs.rmSync(tmp, { force: true })
      throw e
    }
  }

  // Prune by the date in the filename (not mtime, which restores may alter).
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS)
  const cutoffStr = localDateString(cutoff)
  const deleted: string[] = []
  for (const name of fs.readdirSync(BACKUP_DIR)) {
    const m = BACKUP_FILE_RE.exec(name)
    if (!m || m[1] >= cutoffStr) continue
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, name))
      deleted.push(name)
    } catch (e) {
      console.error(`[backup] could not delete ${name}: ${String(e)}`)
    }
  }

  return { file, created, deleted }
}

async function runBackupLogged() {
  try {
    const r = await runBackup()
    console.log(
      `[backup] ${r.created ? 'created' : 'already exists'}: ${r.file}` +
      (r.deleted.length ? `, pruned ${r.deleted.length} old (${r.deleted.join(', ')})` : '')
    )
  } catch (e) {
    console.error(`[backup] failed: ${String(e)}`)
  }
}

let scheduled = false

/**
 * Run a backup shortly after startup, then once every 24 h. Timers are
 * unref'd so they never keep the process alive on shutdown. Safe to call
 * more than once; only the first call schedules anything.
 */
export function scheduleBackups() {
  if (scheduled) return
  scheduled = true
  setTimeout(runBackupLogged, INITIAL_DELAY_MS).unref()
  setInterval(runBackupLogged, INTERVAL_MS).unref()
}
