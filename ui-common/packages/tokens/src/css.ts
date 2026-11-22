import { darkColors, lightColors, type ThemeColors } from './colors'
import {
  blur,
  breakpoints,
  controlSize,
  darkShadows,
  fontFamily,
  fontWeight,
  gradients,
  layout,
  lightShadows,
  motion,
  radius,
  spacing,
  textStyles,
  textures,
  zIndex,
  type ShadowLayer,
  type TextStyle,
  type ThemeShadows,
} from './scale'
import { productIds } from './products'

export type ThemeName = 'light' | 'dark'

export interface Theme {
  colors: ThemeColors
  shadows: ThemeShadows
}

export const themes: Record<ThemeName, Theme> = {
  light: { colors: lightColors, shadows: lightShadows },
  dark: { colors: darkColors, shadows: darkShadows },
}

/** All non-theme tokens in one object (what a React Native app would import). */
export const staticTokens = {
  spacing,
  radius,
  layout,
  textures,
  fontFamily,
  fontWeight,
  textStyles,
  motion,
  zIndex,
  controlSize,
  breakpoints,
} as const

export const CSS_PREFIX = 'pp'

const kebab = (s: string): string => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

/** `cssVarName('color', 'surfaceSunken')` -> `--pp-color-surface-sunken` */
export function cssVarName(...parts: (string | number)[]): string {
  return `--${CSS_PREFIX}-${parts.map((p) => kebab(String(p))).join('-')}`
}

/** `cssVar('color', 'accent')` -> `var(--pp-color-accent)` */
export function cssVar(...parts: (string | number)[]): string {
  return `var(${cssVarName(...parts)})`
}

const rem = (px: number): string => (px === 0 ? '0' : `${Number((px / 16).toFixed(4))}rem`)

const FLUID_FROM = 375
const FLUID_TO = 1280

/** Fixed size, or a clamp() that scales between `minSize` at 375px and `size` at 1280px viewports. */
function fluidSize(t: TextStyle): string {
  if (t.minSize === undefined) return rem(t.size)
  const slope = Number(((t.size - t.minSize) / (FLUID_TO - FLUID_FROM)).toFixed(5))
  return `clamp(${rem(t.minSize)}, calc(${rem(t.minSize)} + (100vw - ${rem(FLUID_FROM)}) * ${slope}), ${rem(t.size)})`
}
const px = (n: number): string => (n === 0 ? '0' : `${n}px`)

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function shadowToCss(layers: readonly ShadowLayer[]): string {
  return layers
    .map((l) => {
      const [r, g, b] = hexToRgb(l.color)
      return `${l.inset ? 'inset ' : ''}${px(l.x)} ${px(l.y)} ${px(l.blur)} ${px(l.spread)} rgb(${r} ${g} ${b} / ${l.opacity})`
    })
    .join(', ')
}

type Entry = readonly [name: string, value: string]

/** CSS custom properties that do not change between themes. */
export function staticCssVars(): Entry[] {
  const out: Entry[] = []
  for (const [k, v] of Object.entries(spacing)) out.push([cssVarName('space', k), rem(v)])
  for (const [k, v] of Object.entries(radius)) out.push([cssVarName('radius', k), px(v)])
  for (const [k, v] of Object.entries(fontFamily)) out.push([cssVarName('font', k), v])
  for (const [k, v] of Object.entries(fontWeight)) out.push([cssVarName('weight', k), String(v)])
  for (const [k, v] of Object.entries(layout)) out.push([cssVarName('layout', k), rem(v)])
  for (const [k, v] of Object.entries(textures)) out.push([cssVarName('texture', k), v])
  for (const [k, t] of Object.entries<TextStyle>(textStyles)) {
    out.push([cssVarName('text', k, 'family'), cssVar('font', t.family)])
    out.push([cssVarName('text', k, 'size'), fluidSize(t)])
    out.push([
      cssVarName('text', k, 'line'),
      t.minSize === undefined
        ? rem(t.lineHeight)
        : String(Number((t.lineHeight / t.size).toFixed(3))),
    ])
    out.push([cssVarName('text', k, 'weight'), String(t.weight)])
    out.push([cssVarName('text', k, 'tracking'), `${t.tracking}em`])
  }
  for (const [k, v] of Object.entries(motion.duration))
    out.push([cssVarName('duration', k), `${v}ms`])
  for (const [k, v] of Object.entries(motion.easing))
    out.push([cssVarName('ease', k), `cubic-bezier(${v.join(', ')})`])
  out.push([
    cssVarName('ease', 'spring'),
    'linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121 24.2%, 1.131 25.8%, 1.108 29.5%, 1.036 34.8%, 0.993 40.3%, 0.985 44.4%, 0.997 54.5%, 1.003 63%, 1)',
  ])
  for (const [k, v] of Object.entries(blur)) out.push([cssVarName('blur', k), px(v)])
  for (const [k, v] of Object.entries(zIndex)) out.push([cssVarName('z', k), String(v)])
  for (const [k, v] of Object.entries(controlSize)) out.push([cssVarName('control', k), rem(v)])
  return out
}

/** CSS custom properties that differ per theme. */
export function themeCssVars(theme: Theme): Entry[] {
  const out: Entry[] = []
  for (const [k, v] of Object.entries(theme.colors)) out.push([cssVarName('color', k), v])
  for (const [k, v] of Object.entries(theme.shadows))
    out.push([cssVarName('shadow', k), shadowToCss(v)])
  for (const [k, v] of Object.entries(gradients)) out.push([cssVarName('gradient', k), v])
  return out
}

const block = (selector: string, entries: Entry[], extra: string[] = [], indent = ''): string =>
  [
    `${indent}${selector} {`,
    ...extra.map((l) => `${indent}  ${l}`),
    ...entries.map(([n, v]) => `${indent}  ${n}: ${v};`),
    `${indent}}`,
  ].join('\n')

/**
 * Scopes that re-point semantic roles. Both reference theme-level variables, so they work in
 * either theme and when nested inside a `data-theme` subtree.
 *
 *  - `[data-product="waiting-on"]`: the accent roles become that product's accent, so every
 *    Button, Badge, Tab and link inside takes the product color with no per-component work.
 *  - `[data-surface="vault"]`: the surface, text and accent roles become the dark vault palette,
 *    so any component placed on a vault band or sidebar is legible without changes.
 */
export function scopeCss(): string {
  const product = productIds
    .map((id) =>
      block(
        `[data-product='${id}']`,
        [
          ['accent', ''],
          ['accent-hover', '-hover'],
          ['accent-active', '-active'],
          ['accent-subtle', '-subtle'],
          ['accent-text', '-text'],
          ['on-accent', '-on'],
        ].map(
          ([role, suffix]) =>
            [`--pp-color-${role}`, `var(--pp-color-product-${id}${suffix})`] as const,
        ),
      ),
    )
    .join('\n\n')
  const vaultMap: Entry[] = [
    ['canvas', 'vault'],
    ['surface', 'vault-raised'],
    ['surface-sunken', 'vault-sunken'],
    ['surface-overlay', 'vault-raised'],
    ['text', 'on-vault'],
    ['text-muted', 'on-vault-muted'],
    ['text-subtle', 'on-vault-subtle'],
    ['border', 'vault-border'],
    ['hairline', 'vault-border'],
    ['border-strong', 'vault-border-strong'],
    ['accent', 'vault-accent'],
    ['accent-hover', 'vault-accent'],
    ['accent-active', 'vault-accent'],
    ['accent-subtle', 'vault-accent-subtle'],
    ['accent-text', 'vault-accent'],
    ['on-accent', 'on-vault-accent'],
    ['brass', 'vault-brass'],
    ['brass-subtle', 'vault-brass-subtle'],
    ['brass-text', 'vault-brass'],
    ['focus-ring', 'vault-brass'],
  ].map(([role, source]) => [`--pp-color-${role}`, `var(--pp-color-${source})`] as const)
  const vault = block("[data-surface='vault']", vaultMap, [
    'color-scheme: dark;',
    'background-color: var(--pp-color-vault);',
    'color: var(--pp-color-on-vault);',
  ])
  return `${product}\n\n${vault}`
}

/**
 * The complete stylesheet.
 *
 * Theme resolution:
 *  - no `data-theme` attribute -> follows `prefers-color-scheme`
 *  - `data-theme="light" | "dark"` on <html> (or any subtree) -> forced
 */
export function buildCss(): string {
  const reduced: Entry[] = Object.keys(motion.duration).map(
    (k) => [cssVarName('duration', k), '0.01ms'] as const,
  )
  return (
    [
      '/* GENERATED by packages/tokens/scripts/generate-css.ts - do not edit. Run `pnpm tokens:generate`. */',
      block(':root', staticCssVars()),
      block(":root,\n[data-theme='light']", themeCssVars(themes.light), ['color-scheme: light;']),
      '@media (prefers-color-scheme: dark) {',
      block(':root:not([data-theme])', themeCssVars(themes.dark), ['color-scheme: dark;'], '  '),
      '}',
      block("[data-theme='dark']", themeCssVars(themes.dark), ['color-scheme: dark;']),
      scopeCss(),
      '@media (prefers-reduced-motion: reduce) {',
      block(':root', reduced, [], '  '),
      '}',
    ].join('\n\n') + '\n'
  )
}

type VarTree<T> = { [K in keyof T]: string }

const mapVars = <T extends object>(group: string, source: T): VarTree<T> =>
  Object.fromEntries(Object.keys(source).map((k) => [k, cssVar(group, k)])) as VarTree<T>

/**
 * Typed `var(--pp-...)` references, e.g. `vars.color.accent`. Handy for inline styles and
 * CSS-in-JS; CSS files can use the custom properties directly.
 */
export const vars = {
  color: mapVars('color', lightColors),
  shadow: mapVars('shadow', lightShadows),
  gradient: mapVars('gradient', gradients),
  blur: mapVars('blur', blur),
  space: mapVars('space', spacing),
  radius: mapVars('radius', radius),
  font: mapVars('font', fontFamily),
  weight: mapVars('weight', fontWeight),
  duration: mapVars('duration', motion.duration),
  ease: mapVars('ease', motion.easing),
  z: mapVars('z', zIndex),
  control: mapVars('control', controlSize),
  layout: mapVars('layout', layout),
  texture: mapVars('texture', textures),
} as const
