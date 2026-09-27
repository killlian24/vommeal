import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { resolveCommit, resolveVersion } from '../lib/buildInfo.js'

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const OTHER = '0123456789abcdef0123456789abcdef01234567'
const dirs: string[] = []
function repo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vommeal-build-'))
  dirs.push(root)
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    fs.writeFileSync(path.join(root, name), content)
  }
  return root
}
afterAll(() => dirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })))

describe('resolveCommit', () => {
  it('prefers the environment, in order', () => {
    const root = repo({ '.git/HEAD': SHA + '\n' })
    expect(resolveCommit({ root, env: { VOMMEAL_COMMIT: 'abc1234', GIT_COMMIT: OTHER } })).toBe('abc1234')
    expect(resolveCommit({ root, env: { SOURCE_COMMIT: OTHER } })).toBe(OTHER)
    expect(resolveCommit({ root, env: { GIT_COMMIT: OTHER } })).toBe(OTHER)
    // Junk in the variable is ignored
    expect(resolveCommit({ root, env: { VOMMEAL_COMMIT: '$(rm -rf /)' } })).toBe(SHA)
  })

  it('follows HEAD to a branch ref', () => {
    const root = repo({ '.git/HEAD': 'ref: refs/heads/claude/some-branch\n', '.git/refs/heads/claude/some-branch': SHA + '\n' })
    expect(resolveCommit({ root, env: {} })).toBe(SHA)
  })

  it('reads a detached HEAD', () => {
    expect(resolveCommit({ root: repo({ '.git/HEAD': OTHER }), env: {} })).toBe(OTHER)
  })

  it('finds a branch only listed in packed-refs', () => {
    const root = repo({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.git/packed-refs': `# pack-refs with: peeled fully-peeled sorted\n${OTHER} refs/heads/other\n${SHA} refs/heads/main\n`,
    })
    expect(resolveCommit({ root, env: {} })).toBe(SHA)
  })

  it('follows a worktree .git file to the common directory', () => {
    const root = repo({
      'main/.git/refs/heads/feature': SHA,
      'main/.git/worktrees/wt/HEAD': 'ref: refs/heads/feature',
      'main/.git/worktrees/wt/commondir': '../..',
      'wt/.git': 'gitdir: ../main/.git/worktrees/wt\n',
    })
    expect(resolveCommit({ root: path.join(root, 'wt'), env: {} })).toBe(SHA)
  })

  it('is empty without .git or with a missing ref, and never throws', () => {
    expect(resolveCommit({ root: repo({ 'package.json': '{}' }), env: {} })).toBe('')
    expect(resolveCommit({ root: repo({ '.git/HEAD': 'ref: refs/heads/gone' }), env: {} })).toBe('')
    expect(resolveCommit({ root: '/does/not/exist', env: {} })).toBe('')
  })
})

describe('resolveVersion', () => {
  it('reads package.json', () => {
    expect(resolveVersion(repo({ 'package.json': '{"version":"1.2.3"}' }))).toBe('1.2.3')
    expect(resolveVersion('/does/not/exist')).toBe('')
  })
})
