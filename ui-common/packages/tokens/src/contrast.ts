/** WCAG 2.x relative luminance + contrast ratio helpers (used by tests and the gallery). */
function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Mix two 6-digit hex colors in sRGB bytes: `weight` (0..1) is the share of `b`. */
export function mixHex(a: string, b: string, weight: number): string {
  const parse = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '')
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const pa = parse(a)
  const pb = parse(b)
  const hex = pa.map((v, i) =>
    Math.round(v * (1 - weight) + (pb[i] as number) * weight)
      .toString(16)
      .padStart(2, '0'),
  )
  return `#${hex.join('')}`.toUpperCase()
}
