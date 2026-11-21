import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildCss,
  contrastRatio,
  cssVar,
  cssVarName,
  darkColors,
  isProductId,
  lightColors,
  mixHex,
  productIds,
  productKey,
  productNames,
  productVar,
  scopeCss,
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
  ['brassText', 'canvas'],
  ['brassText', 'surface'],
  ['brassText', 'brassSubtle'],
  // vault: the dark surface that stays dark in both themes
  ['onVault', 'vault'],
  ['onVault', 'vaultRaised'],
  ['onVaultMuted', 'vault'],
  ['onVaultMuted', 'vaultRaised'],
  ['onVaultSubtle', 'vault'],
  ['onVaultSubtle', 'vaultRaised'],
  ['vaultAccent', 'vault'],
  ['vaultAccent', 'vaultRaised'],
  ['vaultAccent', 'vaultAccentSubtle'],
  ['onVaultAccent', 'vaultAccent'],
  ['vaultBrass', 'vault'],
  ['vaultBrass', 'vaultRaised'],
  ['vaultBrass', 'vaultBrassSubtle'],
]

const cap = (key: string): string => key.charAt(0).toUpperCase() + key.slice(1)
const productName = (id: (typeof productIds)[number]): string => `product${cap(productKey(id))}`

/** Every product: its text on canvas, surface and its own tint; the label on the solid fill and its states. */
const PRODUCT_TEXT_PAIRS: Pair[] = productIds.flatMap((id) => {
  const k = productName(id)
  return [
    [`${k}Text`, 'canvas'],
    [`${k}Text`, 'surface'],
    [`${k}Text`, `${k}Subtle`],
    [`${k}On`, k],
    [`${k}On`, `${k}Hover`],
    [`${k}On`, `${k}Active`],
  ] as Pair[]
})

/** Non-text UI graphics: WCAG 1.4.11 (3:1). */
const UI_PAIRS: Pair[] = [
  ['borderStrong', 'canvas'],
  ['borderStrong', 'surface'],
  ['focusRing', 'canvas'],
  ['focusRing', 'surface'],
  ['focusRing', 'surfaceOverlay'],
  ['accent', 'canvas'],
  ['accent', 'surface'],
  ['brass', 'canvas'],
  ['brass', 'surface'],
  ['vaultBorderStrong', 'vault'],
  ['danger', 'surface'],
  ['success', 'surface'],
  ['warning', 'surface'],
  ['info', 'surface'],
]

const PRODUCT_UI_PAIRS: Pair[] = productIds.flatMap((id) => {
  const k = productName(id)
  return [
    [k, 'canvas'],
    [k, 'surface'],
  ] as Pair[]
})

const themeNames: ThemeName[] = ['light', 'dark']

describe.each(themeNames)('%s theme contrast (WCAG AA)', (name) => {
  const c = themes[name].colors
  it.each([...TEXT_PAIRS, ...PRODUCT_TEXT_PAIRS])('text %s on %s >= 4.5:1', (fg, bg) => {
    expect(contrastRatio(c[fg], c[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
  })
  it.each([...UI_PAIRS, ...PRODUCT_UI_PAIRS])('graphic %s on %s >= 3:1', (fg, bg) => {
    expect(contrastRatio(c[fg], c[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3)
  })
  it('focus ring is visible against the accent fill too (>= 3:1)', () => {
    expect(contrastRatio(c.focusRing, c.canvas)).toBeGreaterThanOrEqual(3)
  })
  it('the vault focus ring (brass) is visible on the vault surface (>= 3:1)', () => {
    expect(contrastRatio(c.vaultBrass, c.vault)).toBeGreaterThanOrEqual(3)
  })
})

describe('products', () => {
  it('has the six products with names, keys and css variables', () => {
    expect(productIds).toEqual([
      'waiting-on',
      'consent',
      'home-pulse',
      'ask-your-life',
      'digital-legacy',
      'family-treasury',
    ])
    expect(productNames['home-pulse']).toBe('Home Pulse')
    expect(productKey('ask-your-life')).toBe('askYourLife')
    expect(isProductId('consent')).toBe(true)
    expect(isProductId('core')).toBe(false)
    expect(productVar('waiting-on')).toBe('var(--pp-color-product-waiting-on)')
    expect(productVar('family-treasury', 'text')).toBe(
      'var(--pp-color-product-family-treasury-text)',
    )
  })

  it.each(themeNames)('%s: every product has a distinct accent', (name) => {
    const c = themes[name].colors
    const accents = productIds.map((id) => c[productName(id) as keyof ThemeColors])
    expect(new Set(accents).size).toBe(productIds.length)
  })

  it('scopes accent roles per product and remaps the vault surface', () => {
    const scoped = scopeCss()
    for (const id of productIds) {
      expect(scoped).toContain(`[data-product='${id}']`)
      expect(scoped).toContain(`--pp-color-accent: var(--pp-color-product-${id});`)
    }
    expect(scoped).toContain("[data-surface='vault']")
    expect(scoped).toContain('--pp-color-text: var(--pp-color-on-vault);')
  })
})

describe('mixHex', () => {
  it('mixes in sRGB and keeps uppercase 6-digit hex', () => {
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080')
    expect(mixHex('#102030', '#102030', 0.7)).toBe('#102030')
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
    expect(vars.color.productWaitingOn).toBe('var(--pp-color-product-waiting-on)')
  })

  it('declares every color role for both themes', () => {
    const themed = css.slice(0, css.indexOf("[data-product='"))
    for (const role of Object.keys(lightColors)) {
      const varName = cssVarName('color', role)
      // light, system-dark, forced-dark (the scope blocks after them only re-point roles)
      expect(themed.split(`${varName}:`).length - 1, varName).toBe(3)
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
    expect(css).toMatch(/--pp-shadow-xs: 0 1px 1px 0 rgb\(20 33 28 \/ 0\.05\);/)
    expect(css).toMatch(/--pp-shadow-inset: inset 0 1px 2px 0 rgb\(20 33 28 \/ 0\.1\)/)
  })

  it('makes display sizes fluid and body sizes fixed', () => {
    expect(css).toMatch(/--pp-text-hero-size: clamp\(2\.625rem, calc\(/)
    expect(css).toMatch(/--pp-text-hero-line: 1\.0\d+;/)
    expect(css).toContain('--pp-text-body-size: 1rem;')
    expect(css).toContain('--pp-text-body-line: 1.5rem;')
  })

  it('collapses every duration under prefers-reduced-motion', () => {
    const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'))
    for (const name of ['instant', 'fast', 'normal', 'slow', 'slower'])
      expect(reduced).toContain(`--pp-duration-${name}: 0.01ms;`)
  })

  it('committed tokens.css is up to date with the TS source', () => {
    const file = resolve(import.meta.dirname, '../tokens.css')
    expect(readFileSync(file, 'utf8')).toBe(css)
  })
})
