import { mixHex } from './contrast'
import { productKeys, type ProductKey } from './products'

/**
 * Semantic color roles. Components reference roles (never raw hex), so a theme is just a
 * different value for each role. Hex only (6 or 8 digits) so every platform can parse them.
 *
 * Identity, "vault and brass": a stone-green paper ground, near-black green ink, a patina
 * (verdigris) accent for trust, a rare brass for the things that are lent or sealed, and a
 * deep "vault" surface that stays dark in both themes (sidebar, hero bands, seals). Each product
 * adds one accent of its own; see `ProductColors`.
 */
export interface BaseThemeColors {
  /** Page background. */
  canvas: string
  /** The soft lime-tinted ground behind the floating app frame. */
  backdrop: string
  /** Cards, panels, inputs. */
  surface: string
  /** Wells, table headers, code blocks. */
  surfaceSunken: string
  /** Dialogs, popovers, toasts. */
  surfaceOverlay: string
  /** Scrim behind modal surfaces (8-digit hex, includes alpha). */
  scrim: string
  /** Placeholder shimmer base for skeletons. */
  skeleton: string
  /** Top-edge light on raised surfaces (8-digit hex, includes alpha). */
  highlight: string
  /** Top of a raised card gradient: a half-step lighter than `surface`. */
  surfaceRaised: string
  /** Frosted-glass fill (8-digit hex). Always used over a backdrop blur. */
  glass: string
  /** A denser glass fill for panels that carry text over busy backgrounds (8-digit hex). */
  glassStrong: string
  /** Hairline border of a glass surface (8-digit hex). */
  glassBorder: string
  /** Cursor-following spotlight tint on cards (8-digit hex). */
  spotlight: string
  /** Accent halo for glow shadows and focus glow (8-digit hex). */
  glowAccent: string
  /** Brass halo (8-digit hex). */
  glowBrass: string

  text: string
  textMuted: string
  textSubtle: string
  textInverse: string

  /** Quietest divider, for lines inside a surface (not required to meet 3:1). */
  hairline: string
  /** Decorative dividers and card outlines (not required to meet 3:1). */
  border: string
  /** Form-control boundaries and other meaningful graphics (>= 3:1 on surfaces). */
  borderStrong: string

  accent: string
  accentHover: string
  accentActive: string
  accentSubtle: string
  /** Accent used as text/icon on canvas, surface and accentSubtle. */
  accentText: string
  /** Text/icon on a solid accent background. */
  onAccent: string

  /** Brass: the rare metallic highlight (seals, owner, "lent" things). Graphic use, >= 3:1. */
  brass: string
  brassSubtle: string
  /** Brass as text/icon on canvas, surface and brassSubtle. */
  brassText: string

  /** The primary action fill: a black pill on paper, a lime pill on dark. Not re-pointed by `data-product`. */
  action: string
  actionHover: string
  actionActive: string
  /** Text/icon on a solid action background. */
  onAction: string

  /** Lime: the signature highlight (deltas, counts, promo cards). Same hue in both themes. */
  lime: string
  limeSubtle: string
  /** Lime-family text on canvas, surface and limeSubtle (an olive on paper, lime itself on dark). */
  limeText: string
  /** Text/icon on a solid lime background. */
  onLime: string

  /** Lilac: the second chart hue and the quiet highlight. */
  lilac: string
  lilacSubtle: string
  lilacText: string
  onLilac: string

  /** Aurora stops: decorative only (backgrounds, glows, gradient text). Never carry text on them alone. */
  auroraLilac: string
  auroraLime: string
  auroraBrass: string
  auroraPatina: string

  danger: string
  dangerHover: string
  dangerSubtle: string
  dangerText: string
  onDanger: string

  success: string
  successSubtle: string
  successText: string

  warning: string
  warningSubtle: string
  warningText: string

  info: string
  infoSubtle: string
  infoText: string

  focusRing: string

  /** Vault surfaces stay dark in both themes. `data-surface="vault"` remaps the semantic roles to these. */
  vault: string
  vaultRaised: string
  vaultSunken: string
  vaultBorder: string
  vaultBorderStrong: string
  onVault: string
  onVaultMuted: string
  onVaultSubtle: string
  vaultAccent: string
  vaultAccentSubtle: string
  onVaultAccent: string
  vaultBrass: string
  vaultBrassSubtle: string
}

export type ProductColorSuffix = '' | 'Hover' | 'Active' | 'Subtle' | 'Text' | 'On'
export type ProductColorKey = `product${Capitalize<ProductKey>}${ProductColorSuffix}`
/** Six values per product: accent fill, hover, active, subtle tint, text/icon, and the color on the fill. */
export type ProductColors = Record<ProductColorKey, string>

export type ThemeColors = BaseThemeColors & ProductColors

interface ProductSeed {
  accent: string
  text: string
  subtle: string
  on: string
}

/**
 * Hover and active are derived from the accent (darker in light, lighter in dark) so the whole
 * set stays consistent; the contrast test covers the derived values too.
 */
function productColors(seeds: Record<ProductKey, ProductSeed>, toward: string): ProductColors {
  const out: Record<string, string> = {}
  for (const key of productKeys) {
    const seed = seeds[key]
    const base = `product${key.charAt(0).toUpperCase()}${key.slice(1)}`
    out[base] = seed.accent
    out[`${base}Hover`] = mixHex(seed.accent, toward, 0.18)
    out[`${base}Active`] = mixHex(seed.accent, toward, 0.32)
    out[`${base}Subtle`] = seed.subtle
    out[`${base}Text`] = seed.text
    out[`${base}On`] = seed.on
  }
  return out as ProductColors
}

const lightProducts = productColors(
  {
    // ochre: patience, things in flight
    waitingOn: { accent: '#8A5A0A', text: '#7A4D05', subtle: '#F3E3C2', on: '#FBFAF6' },
    // patina: the brand's own trust color
    consent: { accent: '#0E5C52', text: '#0E5C52', subtle: '#D8EAE3', on: '#FBFAF6' },
    // harbour blue: sensors, water, air
    homePulse: { accent: '#2A5C9C', text: '#244F88', subtle: '#DCE6F5', on: '#FBFAF6' },
    // iris: the only violet, kept to the one product that talks back
    askYourLife: { accent: '#5B4AA6', text: '#4F3F96', subtle: '#E5E0F4', on: '#FBFAF6' },
    // wine: what is handed on
    digitalLegacy: { accent: '#8C2F4C', text: '#7C2742', subtle: '#F4DDE3', on: '#FBFAF6' },
    // moss: household money
    familyTreasury: { accent: '#4D6A1B', text: '#415C14', subtle: '#E4ECD0', on: '#FBFAF6' },
  },
  '#000000',
)

const darkProducts = productColors(
  {
    waitingOn: { accent: '#E3AE55', text: '#EDBF74', subtle: '#3A2A0D', on: '#0A1512' },
    consent: { accent: '#5FC9B5', text: '#7ED3C2', subtle: '#17332E', on: '#0A1512' },
    homePulse: { accent: '#8DB4EE', text: '#A9C6F3', subtle: '#1A2A44', on: '#0A1512' },
    askYourLife: { accent: '#B5A8EE', text: '#C7BDF3', subtle: '#2A2347', on: '#0A1512' },
    digitalLegacy: { accent: '#EE9BB3', text: '#F4B3C5', subtle: '#41202B', on: '#0A1512' },
    familyTreasury: { accent: '#A8CC6A', text: '#BCDB88', subtle: '#27330F', on: '#0A1512' },
  },
  '#FFFFFF',
)

export const lightColors: ThemeColors = {
  canvas: '#E4E4E1',
  backdrop: '#DCE5B5',
  surface: '#FFFFFF',
  surfaceSunken: '#EFEFEB',
  surfaceOverlay: '#FFFFFF',
  scrim: '#11111173',
  skeleton: '#E3E3DE',
  highlight: '#FFFFFFE6',
  surfaceRaised: '#FFFFFF',
  glass: '#FFFFFFB3',
  glassStrong: '#FFFFFFE6',
  glassBorder: '#FFFFFFF2',
  spotlight: '#D9F26B59',
  glowAccent: '#A8C92A59',
  glowBrass: '#A97C1F33',

  text: '#111111',
  textMuted: '#43433F',
  textSubtle: '#5F5F5A',
  textInverse: '#F4F4F0',

  hairline: '#EDEDE9',
  border: '#DCDCD6',
  borderStrong: '#7A7A74',

  accent: '#111111',
  accentHover: '#2C2C2C',
  accentActive: '#000000',
  accentSubtle: '#E7F5A6',
  accentText: '#111111',
  onAccent: '#FFFFFF',

  brass: '#9A6F14',
  brassSubtle: '#F1E6C9',
  brassText: '#6F4F0C',

  action: '#111111',
  actionHover: '#2C2C2C',
  actionActive: '#000000',
  onAction: '#FFFFFF',

  lime: '#D9F26B',
  limeSubtle: '#EEF8C2',
  limeText: '#4A5A00',
  onLime: '#1A2000',

  lilac: '#BDB4F4',
  lilacSubtle: '#E9E6FB',
  lilacText: '#4B3FB0',
  onLilac: '#1B1740',

  auroraLilac: '#8E7FF0',
  auroraLime: '#C6EA4F',
  auroraBrass: '#E0B65A',
  auroraPatina: '#2FD3B5',

  danger: '#A8322A',
  dangerHover: '#8C2620',
  dangerSubtle: '#F6DDD8',
  dangerText: '#8F2A22',
  onDanger: '#FBFAF6',

  success: '#2B6B3F',
  successSubtle: '#DAEBDC',
  successText: '#1F5A33',

  warning: '#A85F00',
  warningSubtle: '#F8E5BF',
  warningText: '#764300',

  info: '#2F4C9A',
  infoSubtle: '#DEE4F5',
  infoText: '#2A4390',

  focusRing: '#5B49D6',

  vault: '#1D1D1D',
  vaultRaised: '#2A2A2A',
  vaultSunken: '#141414',
  vaultBorder: '#3A3A3A',
  vaultBorderStrong: '#8A8A84',
  onVault: '#F4F4F0',
  onVaultMuted: '#BDBDB6',
  onVaultSubtle: '#9A9A93',
  vaultAccent: '#D9F26B',
  vaultAccentSubtle: '#3A4214',
  onVaultAccent: '#1A2000',
  vaultBrass: '#E3C77A',
  vaultBrassSubtle: '#34290F',

  ...lightProducts,
}

export const darkColors: ThemeColors = {
  canvas: '#0D0D0D',
  backdrop: '#050505',
  surface: '#181818',
  surfaceSunken: '#090909',
  surfaceOverlay: '#202020',
  scrim: '#000000B3',
  skeleton: '#232323',
  highlight: '#FFFFFF12',
  surfaceRaised: '#1F1F1F',
  glass: '#FFFFFF0F',
  glassStrong: '#181818CC',
  glassBorder: '#FFFFFF1A',
  spotlight: '#D9F26B26',
  glowAccent: '#D9F26B40',
  glowBrass: '#E2BC6A40',

  text: '#F2F2EE',
  textMuted: '#BDBDB6',
  textSubtle: '#96968F',
  textInverse: '#0D0D0D',

  hairline: '#202020',
  border: '#2C2C2C',
  borderStrong: '#75756F',

  accent: '#D9F26B',
  accentHover: '#E5F78F',
  accentActive: '#EEFAB0',
  accentSubtle: '#2B3212',
  accentText: '#D9F26B',
  onAccent: '#141900',

  brass: '#E2BC6A',
  brassSubtle: '#2C2310',
  brassText: '#EBCB8A',

  action: '#D9F26B',
  actionHover: '#E5F78F',
  actionActive: '#EEFAB0',
  onAction: '#141900',

  lime: '#D9F26B',
  limeSubtle: '#2B3212',
  limeText: '#D9F26B',
  onLime: '#1A2000',

  lilac: '#BDB4F4',
  lilacSubtle: '#25214A',
  lilacText: '#CFC8F8',
  onLilac: '#1B1740',

  auroraLilac: '#7F6CF5',
  auroraLime: '#B5E03A',
  auroraBrass: '#C99A3A',
  auroraPatina: '#1FB89B',

  danger: '#F0857B',
  dangerHover: '#F5A099',
  dangerSubtle: '#3A1D1A',
  dangerText: '#FFA9A0',
  onDanger: '#2A0B08',

  success: '#7CCB92',
  successSubtle: '#17301F',
  successText: '#98DAAB',

  warning: '#E8B04E',
  warningSubtle: '#3A2B0C',
  warningText: '#F0C879',

  info: '#9FB4F5',
  infoSubtle: '#1B2547',
  infoText: '#B6C6FA',

  focusRing: '#BDB4F4',

  vault: '#141414',
  vaultRaised: '#202020',
  vaultSunken: '#0D0D0D',
  vaultBorder: '#2C2C2C',
  vaultBorderStrong: '#8A8A84',
  onVault: '#F4F4F0',
  onVaultMuted: '#BDBDB6',
  onVaultSubtle: '#9A9A93',
  vaultAccent: '#D9F26B',
  vaultAccentSubtle: '#3A4214',
  onVaultAccent: '#1A2000',
  vaultBrass: '#E3C77A',
  vaultBrassSubtle: '#34290F',

  ...darkProducts,
}
