// Which build is running: version, build time and git commit. Read once by
// next.config.js at build time (plain CommonJS, no dependencies) and put
// into the bundle as NEXT_PUBLIC_APP_VERSION / _BUILD_TIME / _COMMIT.
// Nothing here may fail the build: anything unknown becomes ''.
// Unit-tested in tests/buildInfo.test.ts.

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS for next.config.js */
const fs = require('fs')
const path = require('path')

const SAFE = /^[0-9A-Za-z._-]{4,64}$/
const SHA = /^[0-9a-f]{7,40}$/i

function read(file) {
  try { return fs.readFileSync(file, 'utf8').trim() } catch { return '' }
}

/** The real git directory: `.git` itself, or where a `.git` file (worktree) points. */
function gitDirOf(root) {
  const dotGit = path.join(root, '.git')
  try {
    if (fs.statSync(dotGit).isDirectory()) return dotGit
    const m = read(dotGit).match(/^gitdir:\s*(.+)$/m)
    if (m) return path.resolve(root, m[1].trim())
  } catch { /* no .git */ }
  return ''
}

/**
 * Commit of the build: env VOMMEAL_COMMIT, SOURCE_COMMIT or GIT_COMMIT when
 * set, else .git/HEAD (a branch ref, packed-refs or a detached sha), else ''.
 * @param {{ env?: Record<string, string | undefined>, root?: string }} [opts]
 * @returns {string}
 */
function resolveCommit(opts = {}) {
  const env = opts.env || process.env
  for (const key of ['VOMMEAL_COMMIT', 'SOURCE_COMMIT', 'GIT_COMMIT']) {
    const value = (env[key] || '').trim()
    if (value && SAFE.test(value)) return value
  }
  try {
    const gitDir = gitDirOf(opts.root || process.cwd())
    if (!gitDir) return ''
    const head = read(path.join(gitDir, 'HEAD'))
    if (SHA.test(head)) return head.toLowerCase()
    const ref = head.match(/^ref:\s*(\S+)$/)?.[1]
    if (!ref) return ''
    // Worktrees keep branch refs in the main repository ("commondir")
    const common = read(path.join(gitDir, 'commondir'))
    const dirs = [gitDir, ...(common ? [path.resolve(gitDir, common)] : [])]
    for (const dir of dirs) {
      const loose = read(path.join(dir, ref))
      if (SHA.test(loose)) return loose.toLowerCase()
      const packed = read(path.join(dir, 'packed-refs'))
        .split('\n')
        .map(line => line.trim().split(/\s+/))
        .find(([sha, name]) => name === ref && SHA.test(sha || ''))
      if (packed) return packed[0].toLowerCase()
    }
  } catch { /* unreadable: no commit */ }
  return ''
}

/** Version from package.json ('' when unreadable). */
function resolveVersion(root = process.cwd()) {
  try { return String(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version || '') } catch { return '' }
}

module.exports = { resolveCommit, resolveVersion }
