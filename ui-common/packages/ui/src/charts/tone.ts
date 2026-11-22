export type ChartTone =
  'accent' | 'ink' | 'lime' | 'brass' | 'lilac' | 'success' | 'warning' | 'danger' | 'info'

const TONE_VAR: Record<ChartTone, string> = {
  accent: 'var(--pp-color-accent)',
  ink: 'var(--pp-color-text)',
  lime: 'var(--pp-color-lime)',
  brass: 'var(--pp-color-brass)',
  lilac: 'var(--pp-color-lilac)',
  success: 'var(--pp-color-success)',
  warning: 'var(--pp-color-warning)',
  danger: 'var(--pp-color-danger)',
  info: 'var(--pp-color-info)',
}

/** Series order for multi-segment charts: lilac, ink, lime, brass, then the semantic hues. */
export const TONE_ORDER: readonly ChartTone[] = ['lilac', 'ink', 'lime', 'brass', 'info', 'success']

export function toneColor(tone: ChartTone): string {
  return TONE_VAR[tone]
}
