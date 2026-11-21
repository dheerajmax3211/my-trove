/**
 * Semantic color roles. Components reference roles (never raw hex), so a theme is just a
 * different value for each role. Hex only (6 or 8 digits) so every platform can parse them.
 *
 * Identity: "paper & verdigris". Warm paper surfaces, near-black green ink, a deep verdigris
 * accent, and a burnt-orange focus ring. Dark theme is a deep green-black with a mint accent.
 */
export interface ThemeColors {
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

  text: string
  textMuted: string
  textSubtle: string
  textInverse: string

  /** Decorative dividers (not required to meet 3:1). */
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
}

export const lightColors: ThemeColors = {
  canvas: '#F6F2EA',
  surface: '#FFFDF8',
  surfaceSunken: '#ECE6D9',
  surfaceOverlay: '#FFFFFF',
  scrim: '#14181666',
  skeleton: '#E4DDCD',

  text: '#1B201E',
  textMuted: '#424B47',
  textSubtle: '#566159',
  textInverse: '#F6F2EA',

  border: '#DDD6C6',
  borderStrong: '#767F7A',

  accent: '#0E5C52',
  accentHover: '#0A4A42',
  accentActive: '#073A34',
  accentSubtle: '#DAEAE4',
  accentText: '#0E5C52',
  onAccent: '#FFFDF8',

  danger: '#A8322A',
  dangerHover: '#8C2620',
  dangerSubtle: '#F6DDD8',
  dangerText: '#8F2A22',
  onDanger: '#FFFDF8',

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
}

export const darkColors: ThemeColors = {
  canvas: '#101412',
  surface: '#181E1B',
  surfaceSunken: '#0B0E0D',
  surfaceOverlay: '#202825',
  scrim: '#000000B3',
  skeleton: '#26302C',

  text: '#ECE7DC',
  textMuted: '#BCC4BE',
  textSubtle: '#9AA59F',
  textInverse: '#101412',

  border: '#2B3430',
  borderStrong: '#7F8A84',

  accent: '#5FC9B5',
  accentHover: '#7AD6C5',
  accentActive: '#96E0D2',
  accentSubtle: '#17332E',
  accentText: '#7ED3C2',
  onAccent: '#07211C',

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
}
