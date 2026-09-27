import { describe, it, expect } from 'vitest'
import { contrastRatio } from '../lib/contrast'
import config from '../tailwind.config'
import { AVATAR_COLORS, AVATAR_FALLBACK } from '../components/Avatar'

type Colors = Record<string, Record<string, string>>
const colors = config.theme!.extend!.colors as unknown as Colors
const WHITE = '#ffffff'

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    // The finding from the review: white on the orange accent
    expect(contrastRatio(WHITE, '#f97316')).toBeCloseTo(2.8, 1)
  })
})

describe('colour tokens (WCAG AA)', () => {
  it('white text on filled primary buttons and badges reaches 4.5:1', () => {
    expect(contrastRatio(WHITE, colors.primary.solid)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(WHITE, colors.primary.solidHover)).toBeGreaterThanOrEqual(4.5)
  })

  it('hint text reaches 4.5:1 on the page and on cards', () => {
    expect(contrastRatio(colors.ink.hint, colors.bg.DEFAULT)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.ink.hint, colors.bg.card)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.ink.hint, colors.bg.hover)).toBeGreaterThanOrEqual(4.5)
  })

  it('the white initial on every avatar colour reaches 4.5:1', () => {
    for (const c of [...AVATAR_COLORS, AVATAR_FALLBACK]) {
      expect(contrastRatio(WHITE, c)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('checkbox borders reach 3:1 against cards (non-text)', () => {
    expect(contrastRatio('#6b6b6b', colors.bg.card)).toBeGreaterThanOrEqual(3)
  })
})
