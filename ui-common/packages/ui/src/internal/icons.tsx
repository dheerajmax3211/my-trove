import type { ReactNode, SVGProps } from 'react'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Pixel size (width and height). Defaults to 20. */
  size?: number
  /** Accessible name. Omit for decorative icons (the default), which are hidden from AT. */
  title?: string
}

function createIcon(name: string, paths: ReactNode) {
  function Icon({ size = 20, title, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        aria-hidden={title ? undefined : true}
        role={title ? 'img' : undefined}
        aria-label={title}
        {...rest}
      >
        {paths}
      </svg>
    )
  }
  Icon.displayName = name
  return Icon
}

export const MenuIcon = createIcon('MenuIcon', <path d="M4 6h16M4 12h16M4 18h16" />)
export const CloseIcon = createIcon('CloseIcon', <path d="M6 6l12 12M18 6L6 18" />)
export const CheckIcon = createIcon('CheckIcon', <path d="M5 12.5l4.5 4.5L19 7.5" />)
export const MinusIcon = createIcon('MinusIcon', <path d="M6 12h12" />)
export const PlusIcon = createIcon('PlusIcon', <path d="M12 5v14M5 12h14" />)
export const ChevronDownIcon = createIcon('ChevronDownIcon', <path d="M6 9l6 6 6-6" />)
export const ArrowUpIcon = createIcon('ArrowUpIcon', <path d="M12 19V5M5 12l7-7 7 7" />)
export const ArrowDownIcon = createIcon('ArrowDownIcon', <path d="M12 5v14M19 12l-7 7-7-7" />)
export const SortIcon = createIcon('SortIcon', <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />)
export const SearchIcon = createIcon(
  'SearchIcon',
  <>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4-4" />
  </>,
)
export const InfoIcon = createIcon(
  'InfoIcon',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </>,
)
export const AlertIcon = createIcon(
  'AlertIcon',
  <>
    <path d="M12 3l10 18H2L12 3z" />
    <path d="M12 10v5M12 18h.01" />
  </>,
)
export const CheckCircleIcon = createIcon(
  'CheckCircleIcon',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l3 3 5-6" />
  </>,
)
export const XCircleIcon = createIcon(
  'XCircleIcon',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </>,
)
export const InboxIcon = createIcon(
  'InboxIcon',
  <>
    <path d="M3 13l3-8h12l3 8v6H3v-6z" />
    <path d="M3 13h5l1 3h6l1-3h5" />
  </>,
)
