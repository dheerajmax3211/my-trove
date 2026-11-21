import { createElement, type SVGProps } from 'react'

type IconProps = { size?: number } & Omit<SVGProps<SVGSVGElement>, 'children'>

function glyph(name: string, path: string) {
  function Icon({ size = 20, ...rest }: IconProps) {
    return createElement(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.75,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: 'false',
        ...rest,
      },
      createElement('path', { d: path }),
    )
  }
  Icon.displayName = name
  return Icon
}

/** A smart plug: two pins, the body and the cable. Matches the kit's 24px, 1.75px-stroke glyphs. */
export const PlugIcon = glyph('PlugIcon', 'M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v3')
