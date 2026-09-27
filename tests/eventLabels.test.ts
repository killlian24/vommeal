import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { EVENT_LABELS, countByLabel } from '../lib/eventLabels'

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

describe('usage event labels', () => {
  it('has a German label for every event the app records', () => {
    const root = join(__dirname, '..')
    const code = ['app', 'components', 'lib'].flatMap(d => sources(join(root, d))).map(f => readFileSync(f, 'utf8')).join('\n')
    const names = new Set<string>()
    for (const call of code.matchAll(/track(?:Server)?\(([^()]*?)(?:,|\))/g)) {
      // Literals compared against (via === 'drag') are not event names
      for (const m of call[1].matchAll(/(?<!=== )'([a-z][a-z_]+)'/g)) names.add(m[1])
    }
    expect(names.size).toBeGreaterThan(20)
    const missing = [...names].filter(n => !EVENT_LABELS[n])
    expect(missing).toEqual([])
  })

  it('counts unknown names as Sonstige', () => {
    expect(countByLabel({ plan_add: 3, old_event: 2, other_old: 1 })).toEqual([['Abend geplant', 3], ['Sonstige', 3]])
  })
})
