/**
 * Non-color tokens. All values are plain numbers (px / ms) or strings so React Native (Expo)
 * can consume them directly. The CSS generator converts px to rem where it matters.
 */

/**
 * 4px base grid. Keys are the step names used in CSS (`--pp-space-4`). The top of the scale
 * (14-40) is for page rhythm: sections breathe, components stay tight.
 */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
  40: 160,
} as const

/** Tight on controls, generous on surfaces: md for controls, lg for cards, xl for dialogs and hero panels. */
export const radius = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 8,
  lg: 14,
  xl: 24,
  '2xl': 36,
  full: 9999,
} as const

/** Content widths (px) for `Container`. */
export const layout = { narrow: 704, content: 1152, wide: 1312 } as const

export const fontFamily = {
  sans: '"Instrument Sans Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  display:
    '"Young Serif", "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  mono: '"JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
} as const

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const

export type FontFamilyName = keyof typeof fontFamily

export interface TextStyle {
  family: FontFamilyName
  /** px (at the widest viewport when `minSize` is set) */
  size: number
  /** px (absolute so it maps 1:1 to React Native) */
  lineHeight: number
  weight: number
  /** em */
  tracking: number
  /**
   * px at a 375px viewport. When set, CSS scales the size fluidly between `minSize` (375px wide)
   * and `size` (1280px wide), and the line height becomes a unitless ratio.
   */
  minSize?: number
}

/**
 * Type scale as composite text styles. The display face (Young Serif) only ships a regular
 * weight, so display styles are 400; hierarchy there comes from size and spacing, not weight.
 * The text face (Instrument Sans) carries labels, UI and body.
 */
export const textStyles = {
  hero: { family: 'display', size: 76, minSize: 42, lineHeight: 80, weight: 400, tracking: -0.028 },
  displayLg: {
    family: 'display',
    size: 56,
    minSize: 36,
    lineHeight: 60,
    weight: 400,
    tracking: -0.024,
  },
  display: {
    family: 'display',
    size: 44,
    minSize: 32,
    lineHeight: 48,
    weight: 400,
    tracking: -0.02,
  },
  h1: { family: 'display', size: 36, minSize: 30, lineHeight: 42, weight: 400, tracking: -0.015 },
  h2: { family: 'display', size: 26, lineHeight: 34, weight: 400, tracking: -0.01 },
  h3: { family: 'sans', size: 20, lineHeight: 28, weight: 600, tracking: -0.008 },
  h4: { family: 'sans', size: 17, lineHeight: 24, weight: 600, tracking: -0.004 },
  lead: { family: 'sans', size: 20, minSize: 18, lineHeight: 32, weight: 400, tracking: -0.006 },
  body: { family: 'sans', size: 16, lineHeight: 24, weight: 400, tracking: 0 },
  bodySmall: { family: 'sans', size: 14, lineHeight: 20, weight: 400, tracking: 0 },
  label: { family: 'sans', size: 14, lineHeight: 20, weight: 550, tracking: 0.004 },
  caption: { family: 'sans', size: 12, lineHeight: 16, weight: 500, tracking: 0.02 },
  stat: { family: 'display', size: 40, minSize: 32, lineHeight: 44, weight: 400, tracking: -0.02 },
  code: { family: 'mono', size: 13, lineHeight: 20, weight: 450, tracking: 0 },
} as const satisfies Record<string, TextStyle>

export type TextStyleName = keyof typeof textStyles

export interface ShadowLayer {
  x: number
  y: number
  blur: number
  spread: number
  /** 6-digit hex */
  color: string
  /** 0..1 */
  opacity: number
  inset?: boolean
}

export type ShadowName = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'inset'
export type ThemeShadows = Record<ShadowName, readonly ShadowLayer[]>

const INK = '#14211C'

/**
 * Soft layered shadows: a tight contact shadow plus one or two long, low ones, tinted with the
 * green-black ink so they read as paper lifting off paper, never as a gray smudge.
 * `inset` is the carved-in well used by inputs.
 */
export const lightShadows: ThemeShadows = {
  xs: [{ x: 0, y: 1, blur: 1, spread: 0, color: INK, opacity: 0.05 }],
  sm: [
    { x: 0, y: 1, blur: 1, spread: 0, color: INK, opacity: 0.04 },
    { x: 0, y: 1, blur: 3, spread: 0, color: INK, opacity: 0.08 },
  ],
  md: [
    { x: 0, y: 1, blur: 2, spread: 0, color: INK, opacity: 0.05 },
    { x: 0, y: 4, blur: 10, spread: -2, color: INK, opacity: 0.08 },
    { x: 0, y: 12, blur: 24, spread: -8, color: INK, opacity: 0.1 },
  ],
  lg: [
    { x: 0, y: 2, blur: 4, spread: 0, color: INK, opacity: 0.05 },
    { x: 0, y: 10, blur: 20, spread: -4, color: INK, opacity: 0.1 },
    { x: 0, y: 28, blur: 44, spread: -12, color: INK, opacity: 0.16 },
  ],
  xl: [
    { x: 0, y: 4, blur: 8, spread: 0, color: INK, opacity: 0.06 },
    { x: 0, y: 20, blur: 36, spread: -6, color: INK, opacity: 0.14 },
    { x: 0, y: 48, blur: 80, spread: -16, color: INK, opacity: 0.24 },
  ],
  inset: [
    { x: 0, y: 1, blur: 2, spread: 0, color: INK, opacity: 0.1, inset: true },
    { x: 0, y: 0, blur: 0, spread: 1, color: INK, opacity: 0.02, inset: true },
  ],
}

export const darkShadows: ThemeShadows = {
  xs: [{ x: 0, y: 1, blur: 1, spread: 0, color: '#000000', opacity: 0.4 }],
  sm: [
    { x: 0, y: 1, blur: 1, spread: 0, color: '#000000', opacity: 0.3 },
    { x: 0, y: 1, blur: 3, spread: 0, color: '#000000', opacity: 0.4 },
  ],
  md: [
    { x: 0, y: 1, blur: 2, spread: 0, color: '#000000', opacity: 0.35 },
    { x: 0, y: 4, blur: 10, spread: -2, color: '#000000', opacity: 0.4 },
    { x: 0, y: 12, blur: 24, spread: -8, color: '#000000', opacity: 0.5 },
  ],
  lg: [
    { x: 0, y: 2, blur: 4, spread: 0, color: '#000000', opacity: 0.4 },
    { x: 0, y: 10, blur: 20, spread: -4, color: '#000000', opacity: 0.5 },
    { x: 0, y: 28, blur: 44, spread: -12, color: '#000000', opacity: 0.6 },
  ],
  xl: [
    { x: 0, y: 4, blur: 8, spread: 0, color: '#000000', opacity: 0.45 },
    { x: 0, y: 20, blur: 36, spread: -6, color: '#000000', opacity: 0.55 },
    { x: 0, y: 48, blur: 80, spread: -16, color: '#000000', opacity: 0.7 },
  ],
  inset: [
    { x: 0, y: 1, blur: 3, spread: 0, color: '#000000', opacity: 0.5, inset: true },
    { x: 0, y: 0, blur: 0, spread: 1, color: '#000000', opacity: 0.2, inset: true },
  ],
}

/**
 * Motion is tumbler-like: short, decisive, and it settles. `settle` has a hair of overshoot and is
 * reserved for confirmations (a toggle clicking over, a mark landing); everything else eases out.
 */
export const motion = {
  /** ms */
  duration: { instant: 0, fast: 120, normal: 200, slow: 360, slower: 560 },
  /** cubic-bezier control points [x1, y1, x2, y2] (also valid for Reanimated `Easing.bezier`). */
  easing: {
    standard: [0.2, 0, 0, 1],
    enter: [0, 0, 0.2, 1],
    exit: [0.4, 0, 1, 1],
    settle: [0.34, 1.32, 0.64, 1],
  },
} as const

export const zIndex = {
  base: 0,
  sticky: 100,
  drawer: 200,
  overlay: 300,
  modal: 400,
  toast: 500,
  tooltip: 600,
} as const

/** Interactive control heights (px). md/lg are >= 40px for comfortable touch targets. */
export const controlSize = { sm: 32, md: 40, lg: 48 } as const

/** Min-widths (px) for responsive layout. CSS media queries cannot read variables; keep in sync. */
export const breakpoints = { sm: 480, md: 768, lg: 1024, xl: 1280 } as const

const svgUrl = (svg: string): string => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

/**
 * Inline SVG textures (CSS only; they are decoration, never content).
 *  - grain: fine paper tooth. Use at low opacity over a surface.
 *  - ledger: faint horizontal rules, 28px apart, like a ledger page.
 */
export const textures = {
  grain: svgUrl(
    "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .08  0 0 0 0 .13  0 0 0 0 .11  0 0 0 .6 0'/></filter><rect width='160' height='160' filter='url(#n)'/></svg>",
  ),
  ledger: svgUrl(
    "<svg xmlns='http://www.w3.org/2000/svg' width='8' height='28'><rect y='27' width='8' height='1' fill='#14211C' fill-opacity='.07'/></svg>",
  ),
} as const
