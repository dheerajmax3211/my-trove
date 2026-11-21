import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildCss,
  contrastRatio,
  cssVar,
  cssVarName,
  darkColors,
  lightColors,
  themes,
  vars,
  type ThemeColors,
  type ThemeName,
} from './index'

type Pair = [fg: keyof ThemeColors, bg: keyof ThemeColors]

/** Text pairs: WCAG AA for normal text (4.5:1). */
const TEXT_PAIRS: Pair[] = [
  ['text', 'canvas'],
  ['text', 'surface'],
  ['text', 'surfaceSunken'],
  ['text', 'surfaceOverlay'],
  ['textMuted', 'canvas'],
  ['textMuted', 'surface'],
  ['textMuted', 'surfaceSunken'],
  ['textMuted', 'surfaceOverlay'],
  ['textSubtle', 'canvas'],
  ['textSubtle', 'surface'],
  ['textSubtle', 'surfaceOverlay'],
  ['textInverse', 'text'],
  ['onAccent', 'accent'],
  ['onAccent', 'accentHover'],
  ['onAccent', 'accentActive'],
  ['accentText', 'canvas'],
  ['accentText', 'surface'],
  ['accentText', 'accentSubtle'],
  ['onDanger', 'danger'],
  ['onDanger', 'dangerHover'],
  ['dangerText', 'canvas'],
  ['dangerText', 'surface'],
  ['dangerText', 'dangerSubtle'],
  ['successText', 'canvas'],
  ['successText', 'surface'],
  ['successText', 'successSubtle'],
  ['warningText', 'canvas'],
  ['warningText', 'surface'],
  ['warningText', 'warningSubtle'],
  ['infoText', 'canvas'],
  ['infoText', 'surface'],
  ['infoText', 'infoSubtle'],
]

/** Non-text UI graphics: WCAG 1.4.11 (3:1). */
const UI_PAIRS: Pair[] = [
  ['borderStrong', 'canvas'],
  ['borderStrong', 'surface'],
  ['focusRing', 'canvas'],
  ['focusRing', 'surface'],
  ['focusRing', 'surfaceOverlay'],
  ['accent', 'canvas'],
  ['accent', 'surface'],
  ['danger', 'surface'],
  ['success', 'surface'],
  ['warning', 'surface'],
  ['info', 'surface'],
]

const themeNames: ThemeName[] = ['light', 'dark']

describe.each(themeNames)('%s theme contrast (WCAG AA)', (name) => {
  const c = themes[name].colors
  it.each(TEXT_PAIRS)('text %s on %s >= 4.5:1', (fg, bg) => {
    expect(contrastRatio(c[fg], c[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
  })
  it.each(UI_PAIRS)('graphic %s on %s >= 3:1', (fg, bg) => {
    expect(contrastRatio(c[fg], c[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3)
  })
  it('focus ring is visible against the accent fill too (>= 3:1)', () => {
    expect(contrastRatio(c.focusRing, c.canvas)).toBeGreaterThanOrEqual(3)
  })
})

describe('contrastRatio', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1)
  })
})

describe('theme shape', () => {
  it('light and dark define exactly the same roles', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort())
  })
  it('every color is a 6 or 8 digit hex (platform neutral)', () => {
    for (const theme of Object.values(themes))
      for (const value of Object.values(theme.colors))
        expect(value).toMatch(/^#[0-9A-F]{6}([0-9A-F]{2})?$/)
  })
  it('light and dark actually differ for the core surface roles', () => {
    expect(lightColors.canvas).not.toBe(darkColors.canvas)
    expect(lightColors.text).not.toBe(darkColors.text)
  })
})

describe('css generation', () => {
  const css = buildCss()

  it('names variables with the pp prefix and kebab-case', () => {
    expect(cssVarName('color', 'surfaceSunken')).toBe('--pp-color-surface-sunken')
    expect(cssVar('space', 4)).toBe('var(--pp-space-4)')
    expect(vars.color.accent).toBe('var(--pp-color-accent)')
  })

  it('declares every color role for both themes', () => {
    for (const role of Object.keys(lightColors)) {
      const varName = cssVarName('color', role)
      expect(css.split(`${varName}:`).length - 1, varName).toBe(3) // light, system-dark, forced-dark
    }
  })

  it('supports prefers-color-scheme and a data-theme override', () => {
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain(':root:not([data-theme])')
    expect(css).toContain("[data-theme='dark']")
    expect(css).toContain("[data-theme='light']")
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('converts shadow layers to CSS', () => {
    expect(css).toMatch(/--pp-shadow-sm: 0 1px 2px 0 rgb\(27 32 30 \/ 0\.08\);/)
  })

  it('committed tokens.css is up to date with the TS source', () => {
    const file = resolve(import.meta.dirname, '../tokens.css')
    expect(readFileSync(file, 'utf8')).toBe(css)
  })
})
