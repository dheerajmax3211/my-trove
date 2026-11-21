/**
 * Non-color tokens. All values are plain numbers (px / ms) or strings so React Native (Expo)
 * can consume them directly. The CSS generator converts px to rem where it matters.
 */

/** 4px base grid. Keys are the step names used in CSS (`--pp-space-4`). */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 20,
  full: 9999,
} as const

export const fontFamily = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  display: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
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
  /** px */
  size: number
  /** px (absolute so it maps 1:1 to React Native) */
  lineHeight: number
  weight: number
  /** em */
  tracking: number
}

/** Type scale as composite text styles (modular, ~1.2 ratio, 4px-aligned line heights). */
export const textStyles = {
  display: { family: 'display', size: 40, lineHeight: 48, weight: 600, tracking: -0.02 },
  h1: { family: 'display', size: 32, lineHeight: 40, weight: 600, tracking: -0.015 },
  h2: { family: 'display', size: 24, lineHeight: 32, weight: 600, tracking: -0.01 },
  h3: { family: 'sans', size: 20, lineHeight: 28, weight: 600, tracking: -0.005 },
  h4: { family: 'sans', size: 18, lineHeight: 24, weight: 600, tracking: 0 },
  body: { family: 'sans', size: 16, lineHeight: 24, weight: 400, tracking: 0 },
  bodySmall: { family: 'sans', size: 14, lineHeight: 20, weight: 400, tracking: 0 },
  label: { family: 'sans', size: 14, lineHeight: 20, weight: 500, tracking: 0.005 },
  caption: { family: 'sans', size: 12, lineHeight: 16, weight: 500, tracking: 0.02 },
  code: { family: 'mono', size: 14, lineHeight: 20, weight: 400, tracking: 0 },
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
}

export type ShadowName = 'sm' | 'md' | 'lg' | 'xl'
export type ThemeShadows = Record<ShadowName, readonly ShadowLayer[]>

/** Shadows are theme-dependent: warm ink shadows on paper, heavier black ones in dark mode. */
export const lightShadows: ThemeShadows = {
  sm: [{ x: 0, y: 1, blur: 2, spread: 0, color: '#1B201E', opacity: 0.08 }],
  md: [
    { x: 0, y: 2, blur: 4, spread: 0, color: '#1B201E', opacity: 0.06 },
    { x: 0, y: 4, blur: 12, spread: -2, color: '#1B201E', opacity: 0.1 },
  ],
  lg: [
    { x: 0, y: 4, blur: 8, spread: 0, color: '#1B201E', opacity: 0.06 },
    { x: 0, y: 12, blur: 28, spread: -4, color: '#1B201E', opacity: 0.16 },
  ],
  xl: [
    { x: 0, y: 8, blur: 16, spread: 0, color: '#1B201E', opacity: 0.08 },
    { x: 0, y: 24, blur: 56, spread: -8, color: '#1B201E', opacity: 0.24 },
  ],
}

export const darkShadows: ThemeShadows = {
  sm: [{ x: 0, y: 1, blur: 2, spread: 0, color: '#000000', opacity: 0.4 }],
  md: [
    { x: 0, y: 2, blur: 4, spread: 0, color: '#000000', opacity: 0.35 },
    { x: 0, y: 4, blur: 12, spread: -2, color: '#000000', opacity: 0.45 },
  ],
  lg: [
    { x: 0, y: 4, blur: 8, spread: 0, color: '#000000', opacity: 0.4 },
    { x: 0, y: 12, blur: 28, spread: -4, color: '#000000', opacity: 0.6 },
  ],
  xl: [
    { x: 0, y: 8, blur: 16, spread: 0, color: '#000000', opacity: 0.45 },
    { x: 0, y: 24, blur: 56, spread: -8, color: '#000000', opacity: 0.7 },
  ],
}

export const motion = {
  /** ms */
  duration: { instant: 0, fast: 120, normal: 200, slow: 360 },
  /** cubic-bezier control points [x1, y1, x2, y2] (also valid for Reanimated `Easing.bezier`). */
  easing: {
    standard: [0.2, 0, 0, 1],
    enter: [0, 0, 0.2, 1],
    exit: [0.4, 0, 1, 1],
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
