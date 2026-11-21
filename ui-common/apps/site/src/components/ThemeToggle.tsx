import { IconButton, useTheme } from '@platform/ui'

const common = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  focusable: false,
  'aria-hidden': true,
} as const

// @platform/ui does not ship sun and moon glyphs, so the site draws them on the same 24px grid.
function SunGlyph() {
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </svg>
  )
}

function MoonGlyph() {
  return (
    <svg {...common}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  )
}

/** Flips between the light and dark themes. The choice is remembered by ThemeProvider. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  return (
    <IconButton
      label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
      icon={dark ? <SunGlyph /> : <MoonGlyph />}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    />
  )
}
