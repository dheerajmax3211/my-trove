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
  canvas: '#F0EFE7',
  surface: '#FBFAF6',
  surfaceSunken: '#E6E5DA',
  surfaceOverlay: '#FFFFFF',
  scrim: '#0F1F1B73',
  skeleton: '#E0DFD2',
  highlight: '#FFFFFFCC',

  text: '#15201C',
  textMuted: '#3E4944',
  textSubtle: '#55615B',
  textInverse: '#F0EFE7',

  hairline: '#E3E2D6',
  border: '#D8D7C9',
  borderStrong: '#737D77',

  accent: '#0E5C52',
  accentHover: '#0A4A42',
  accentActive: '#073A34',
  accentSubtle: '#D8EAE3',
  accentText: '#0E5C52',
  onAccent: '#FBFAF6',

  brass: '#A97C1F',
  brassSubtle: '#F1E6C9',
  brassText: '#6F4F0C',

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

  focusRing: '#C2570C',

  vault: '#0F1F1B',
  vaultRaised: '#172E28',
  vaultSunken: '#0A1613',
  vaultBorder: '#2B453E',
  vaultBorderStrong: '#7E9A90',
  onVault: '#EEEBDD',
  onVaultMuted: '#B3C4BC',
  onVaultSubtle: '#93A89F',
  vaultAccent: '#6FD6C2',
  vaultAccentSubtle: '#1D3D36',
  onVaultAccent: '#06201B',
  vaultBrass: '#DDB968',
  vaultBrassSubtle: '#3A2F14',

  ...lightProducts,
}

export const darkColors: ThemeColors = {
  canvas: '#101412',
  surface: '#181E1B',
  surfaceSunken: '#0B0E0D',
  surfaceOverlay: '#202825',
  scrim: '#000000B3',
  skeleton: '#26302C',
  highlight: '#FFFFFF12',

  text: '#ECE7DC',
  textMuted: '#BCC4BE',
  textSubtle: '#9AA59F',
  textInverse: '#101412',

  hairline: '#232B28',
  border: '#2B3430',
  borderStrong: '#7F8A84',

  accent: '#5FC9B5',
  accentHover: '#7AD6C5',
  accentActive: '#96E0D2',
  accentSubtle: '#17332E',
  accentText: '#7ED3C2',
  onAccent: '#07211C',

  brass: '#D9B45F',
  brassSubtle: '#35290F',
  brassText: '#E6C985',

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

  focusRing: '#F5A862',

  vault: '#0B1613',
  vaultRaised: '#13241F',
  vaultSunken: '#08100E',
  vaultBorder: '#26403A',
  vaultBorderStrong: '#7E9A90',
  onVault: '#EEEBDD',
  onVaultMuted: '#B3C4BC',
  onVaultSubtle: '#93A89F',
  vaultAccent: '#6FD6C2',
  vaultAccentSubtle: '#1A3832',
  onVaultAccent: '#06201B',
  vaultBrass: '#DDB968',
  vaultBrassSubtle: '#34290F',

  ...darkProducts,
}
