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
        strokeWidth={1.75}
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

/*
 * Icon rules: 24px grid, 1.75px round strokes, no fills (a single small dot may be filled by
 * stroke length), one idea per glyph, 2px optical padding. Keep corners round, keep keyholes
 * and notches where they help the vault story.
 */
export const HomeIcon = createIcon(
  'HomeIcon',
  <>
    <path d="M4 11l8-7 8 7" />
    <path d="M6 9.5V20h12V9.5" />
    <path d="M10 20v-5h4v5" />
  </>,
)
export const UsersIcon = createIcon(
  'UsersIcon',
  <>
    <circle cx="9" cy="8.5" r="3.25" />
    <path d="M3 19.5c.4-3 2.8-5 6-5s5.6 2 6 5" />
    <path d="M15.5 5.6a3.1 3.1 0 010 5.8M17.5 14.7c1.8.6 3 2.2 3.4 4.8" />
  </>,
)
export const UserIcon = createIcon(
  'UserIcon',
  <>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c.5-3.6 3.3-5.5 7-5.5s6.5 1.9 7 5.5" />
  </>,
)
export const ShieldIcon = createIcon(
  'ShieldIcon',
  <>
    <path d="M12 3l7.5 2.8v5.6c0 4.4-3 7.7-7.5 9.6-4.5-1.9-7.5-5.2-7.5-9.6V5.8L12 3z" />
    <path d="M8.8 11.9l2.3 2.3 4.1-4.5" />
  </>,
)
export const KeyIcon = createIcon(
  'KeyIcon',
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l8.5-8.5M16 7l2.5 2.5M13.5 9.5L15.5 11.5" />
  </>,
)
export const ChartIcon = createIcon(
  'ChartIcon',
  <>
    <path d="M4 4v16h16" />
    <path d="M8 15l3.2-4 3 2.5L19 7.5" />
  </>,
)
export const BellIcon = createIcon(
  'BellIcon',
  <>
    <path d="M6 16.5V11a6 6 0 1112 0v5.5l1.5 2h-15l1.5-2z" />
    <path d="M10 21h4" />
  </>,
)
export const ClockIcon = createIcon(
  'ClockIcon',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.2 2" />
  </>,
)
export const FileIcon = createIcon(
  'FileIcon',
  <>
    <path d="M6 3h8l4 4v14H6V3z" />
    <path d="M14 3v4h4M9 12h6M9 16h6" />
  </>,
)
export const FolderIcon = createIcon(
  'FolderIcon',
  <path d="M3 6.5A1.5 1.5 0 014.5 5H10l2 2.5h7.5A1.5 1.5 0 0121 9v9.5a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5v-12z" />,
)
export const SettingsIcon = createIcon(
  'SettingsIcon',
  <>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </>,
)
export const LogoutIcon = createIcon(
  'LogoutIcon',
  <>
    <path d="M10 4H5.5A1.5 1.5 0 004 5.5v13A1.5 1.5 0 005.5 20H10" />
    <path d="M15 8l4 4-4 4M19 12H9" />
  </>,
)
export const LinkIcon = createIcon(
  'LinkIcon',
  <>
    <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1" />
  </>,
)
export const LockIcon = createIcon(
  'LockIcon',
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
    <path d="M12 14.5v2.5" />
  </>,
)
export const SparkleIcon = createIcon(
  'SparkleIcon',
  <>
    <path d="M11 4l1.8 5.2L18 11l-5.2 1.8L11 18l-1.8-5.2L4 11l5.2-1.8L11 4z" />
    <path d="M18.5 3.5v3M17 5h3M18 16.5v3M16.5 18h3" />
  </>,
)
export const ArrowRightIcon = createIcon('ArrowRightIcon', <path d="M5 12h14M13 6l6 6-6 6" />)
export const ArrowLeftIcon = createIcon('ArrowLeftIcon', <path d="M19 12H5M11 6l-6 6 6 6" />)
export const ChevronRightIcon = createIcon('ChevronRightIcon', <path d="M9 6l6 6-6 6" />)
export const ExternalIcon = createIcon(
  'ExternalIcon',
  <>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v4.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 014 18.5v-11A1.5 1.5 0 015.5 6H10" />
  </>,
)
export const CodeIcon = createIcon(
  'CodeIcon',
  <>
    <path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5" />
    <path d="M13.5 5l-3 14" />
  </>,
)
export const EyeIcon = createIcon(
  'EyeIcon',
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.75" />
  </>,
)
export const CopyIcon = createIcon(
  'CopyIcon',
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 9V6.5A1.5 1.5 0 0013.5 5h-8A1.5 1.5 0 004 6.5v8A1.5 1.5 0 005.5 16H9" />
  </>,
)
export const HourglassIcon = createIcon(
  'HourglassIcon',
  <>
    <path d="M6.5 3.5h11M6.5 20.5h11" />
    <path d="M8 3.5c0 4 4 5.5 4 8.5s-4 4.5-4 8.5M16 3.5c0 4-4 5.5-4 8.5s4 4.5 4 8.5" />
  </>,
)
export const CoinsIcon = createIcon(
  'CoinsIcon',
  <>
    <ellipse cx="12" cy="6.5" rx="6.5" ry="2.75" />
    <path d="M5.5 6.5v5c0 1.5 2.9 2.75 6.5 2.75s6.5-1.25 6.5-2.75v-5" />
    <path d="M5.5 11.5v5c0 1.5 2.9 2.75 6.5 2.75s6.5-1.25 6.5-2.75v-5" />
  </>,
)
export const TreeIcon = createIcon(
  'TreeIcon',
  <>
    <circle cx="12" cy="9.5" r="6.5" />
    <path d="M12 16v5M9.5 21h5" />
    <path d="M12 16v-5M12 13.5l-2.6-2.4M12 11.8l2.6-2.3" />
  </>,
)
export const PulseHomeIcon = createIcon(
  'PulseHomeIcon',
  <>
    <path d="M4 11l8-7 8 7v9H4v-9z" />
    <path d="M7 14.5h2.3l1.4-3 2.2 5 1.5-2h2.6" />
  </>,
)
export const ChatSparkIcon = createIcon(
  'ChatSparkIcon',
  <>
    <path d="M5 5h14a1.5 1.5 0 011.5 1.5v9A1.5 1.5 0 0119 17h-7l-4.5 3.5V17H5a1.5 1.5 0 01-1.5-1.5v-9A1.5 1.5 0 015 5z" />
    <path d="M12 8.2l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9.9-2.2z" />
  </>,
)
