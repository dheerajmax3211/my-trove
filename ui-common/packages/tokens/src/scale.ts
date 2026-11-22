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
  sm: 6,
  md: 12,
  lg: 18,
  xl: 28,
  '2xl': 40,
  full: 9999,
} as const

/** Content widths (px) for `Container`. */
export const layout = { narrow: 704, content: 1152, wide: 1312 } as const

export const fontFamily = {
  /** The one app face: a geometric sans with confident numerals. */
  sans: '"Plus Jakarta Sans Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  /** Headlines and figures in the app: the same family, set tight and medium. */
  display:
    '"Plus Jakarta Sans Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  /** The public site's editorial voice. Never in the app. */
  editorial:
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
  displayXl: {
    family: 'display',
    size: 112,
    minSize: 52,
    lineHeight: 104,
    weight: 500,
    tracking: -0.05,
  },
  hero: { family: 'display', size: 84, minSize: 44, lineHeight: 80, weight: 500, tracking: -0.045 },
  displayLg: {
    family: 'display',
    size: 60,
    minSize: 38,
    lineHeight: 62,
    weight: 500,
    tracking: -0.04,
  },
  display: {
    family: 'display',
    size: 46,
    minSize: 32,
    lineHeight: 50,
    weight: 500,
    tracking: -0.035,
  },
  /** The page title in the app: big, tight, medium. */
  h1: { family: 'display', size: 56, minSize: 36, lineHeight: 60, weight: 500, tracking: -0.04 },
  h2: { family: 'display', size: 28, lineHeight: 34, weight: 600, tracking: -0.025 },
  h3: { family: 'sans', size: 20, lineHeight: 28, weight: 600, tracking: -0.015 },
  h4: { family: 'sans', size: 16, lineHeight: 24, weight: 600, tracking: -0.008 },
  lead: { family: 'sans', size: 20, minSize: 17, lineHeight: 32, weight: 400, tracking: -0.012 },
  body: { family: 'sans', size: 15, lineHeight: 24, weight: 400, tracking: -0.003 },
  bodySmall: { family: 'sans', size: 14, lineHeight: 20, weight: 400, tracking: -0.002 },
  label: { family: 'sans', size: 14, lineHeight: 20, weight: 600, tracking: -0.004 },
  caption: { family: 'sans', size: 12, lineHeight: 16, weight: 500, tracking: 0.004 },
  stat: { family: 'display', size: 40, minSize: 32, lineHeight: 44, weight: 500, tracking: -0.04 },
  /** The huge number on a bento card. */
  figure: {
    family: 'display',
    size: 64,
    minSize: 44,
    lineHeight: 64,
    weight: 500,
    tracking: -0.055,
  },
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

export type ShadowName =
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | 'inset'
  /** Accent halo: primary buttons, active tabs, focused fields. */
  | 'glow'
  /** Brass halo: seals, owner marks. */
  | 'glowBrass'
  /** Three-pixel focus glow (a ring of accent at low alpha). */
  | 'focus'
export type ThemeShadows = Record<ShadowName, readonly ShadowLayer[]>

const INK = '#111111'

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
  glow: [
    { x: 0, y: 1, blur: 2, spread: 0, color: '#8FAE1B', opacity: 0.35 },
    { x: 0, y: 8, blur: 24, spread: -6, color: '#8FAE1B', opacity: 0.5 },
  ],
  glowBrass: [
    { x: 0, y: 1, blur: 2, spread: 0, color: '#A97C1F', opacity: 0.3 },
    { x: 0, y: 8, blur: 24, spread: -6, color: '#A97C1F', opacity: 0.4 },
  ],
  focus: [{ x: 0, y: 0, blur: 0, spread: 4, color: '#5B49D6', opacity: 0.22 }],
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
  glow: [
    { x: 0, y: 0, blur: 0, spread: 1, color: '#D9F26B', opacity: 0.35 },
    { x: 0, y: 0, blur: 22, spread: 0, color: '#D9F26B', opacity: 0.38 },
    { x: 0, y: 12, blur: 40, spread: -10, color: '#D9F26B', opacity: 0.4 },
  ],
  glowBrass: [
    { x: 0, y: 0, blur: 0, spread: 1, color: '#E2BC6A', opacity: 0.35 },
    { x: 0, y: 0, blur: 22, spread: 0, color: '#E2BC6A', opacity: 0.3 },
    { x: 0, y: 12, blur: 40, spread: -10, color: '#E2BC6A', opacity: 0.32 },
  ],
  focus: [{ x: 0, y: 0, blur: 0, spread: 4, color: '#BDB4F4', opacity: 0.32 }],
}

/**
 * Motion is tumbler-like: short, decisive, and it settles. `settle` has a hair of overshoot and is
 * reserved for confirmations (a toggle clicking over, a mark landing); everything else eases out.
 */
export const motion = {
  /** ms */
  duration: { instant: 0, fast: 120, normal: 200, slow: 360, slower: 560, cinematic: 900 },
  /** cubic-bezier control points [x1, y1, x2, y2] (also valid for Reanimated `Easing.bezier`). */
  easing: {
    standard: [0.2, 0, 0, 1],
    enter: [0, 0, 0.2, 1],
    exit: [0.4, 0, 1, 1],
    settle: [0.34, 1.32, 0.64, 1],
    /** Expo-out: the long, soft landing used by reveals and page entrances. */
    emphasized: [0.16, 1, 0.3, 1],
    /** Symmetric, for loops and shimmer. */
    inOut: [0.65, 0, 0.35, 1],
  },
  /**
   * Spring presets for `motion` (stiffness / damping / mass). `snappy` for controls, `smooth` for
   * layout and shared-element moves, `gentle` for large surfaces, `bouncy` only for confirmations.
   */
  spring: {
    snappy: { stiffness: 520, damping: 38, mass: 1 },
    smooth: { stiffness: 260, damping: 30, mass: 1 },
    gentle: { stiffness: 140, damping: 24, mass: 1 },
    bouncy: { stiffness: 380, damping: 18, mass: 1 },
  },
  /** Scroll-reveal defaults: distance in px, stagger in seconds. */
  reveal: { distance: 24, stagger: 0.06, viewportMargin: '-8% 0px -8% 0px' },
} as const

/** Backdrop-blur radii (px) for glass surfaces. Keep them modest: blur is the costliest effect we use. */
export const blur = { sm: 8, md: 16, lg: 28, xl: 48 } as const

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
export const controlSize = { sm: 36, md: 44, lg: 52 } as const

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

/**
 * Gradients as CSS values that reference the color roles, so one definition serves both themes
 * (and any `data-product` / `data-surface` scope that re-points the roles). CSS-only: React Native
 * would build its own from the aurora colors.
 */
export const gradients = {
  /** Lilac into lime: the brand wash. */
  brand: 'linear-gradient(135deg, var(--pp-color-aurora-lilac), var(--pp-color-aurora-lime))',
  /** Brass, the lent-and-sealed metal. */
  brass: 'linear-gradient(135deg, var(--pp-color-aurora-brass), var(--pp-color-brass))',
  /** Lilac bleeding into patina. */
  lilac: 'linear-gradient(135deg, var(--pp-color-aurora-lilac), var(--pp-color-aurora-patina))',
  /** Headline accent: ink, lilac, lime. Large display type only. */
  text: 'linear-gradient(100deg, var(--pp-color-text) 6%, var(--pp-color-aurora-lilac) 56%, var(--pp-color-aurora-lime) 100%)',
  /** Primary button fill: a lit top edge sliding into the accent. */
  accentFill:
    'linear-gradient(180deg, color-mix(in srgb, var(--pp-color-action) 88%, #fff), var(--pp-color-action))',
  /** Raised card fill. */
  card: 'linear-gradient(180deg, var(--pp-color-surface-raised), var(--pp-color-surface))',
  /** Light catching the top of a surface. */
  sheen: 'linear-gradient(180deg, rgb(255 255 255 / 0.06), transparent 44%)',
  /** Hairline gradient used as a 1px border (see `.pp-gradient-border`). */
  border:
    'linear-gradient(140deg, color-mix(in srgb, var(--pp-color-aurora-lilac) 60%, transparent), color-mix(in srgb, var(--pp-color-border) 80%, transparent) 36%, color-mix(in srgb, var(--pp-color-aurora-lime) 70%, transparent))',
} as const
