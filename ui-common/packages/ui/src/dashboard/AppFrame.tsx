import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { AppShell, type AppShellProps } from '../components/AppShell/AppShell'
import { Avatar } from '../components/Avatar/Avatar'
import { cx } from '../internal/cx'
import { BellIcon, ChevronDownIcon, SearchIcon } from '../internal/icons'
import { RoundIconButton } from './RoundIconButton'
import styles from './AppFrame.module.css'

export interface UserChipProps {
  name: string
  email?: string
  src?: string
  /** Makes the chip a button (opens an account menu). */
  onClick?: () => void
  className?: string
}

/** Avatar, name, email and a chevron: the account control at the left of the header. */
export function UserChip({ name, email, src, onClick, className }: UserChipProps) {
  const body = (
    <>
      <Avatar name={name} {...(src ? { src } : {})} size="md" decorative />
      <span className={styles.userText}>
        <span className={styles.userName}>{name}</span>
        {email ? <span className={styles.userEmail}>{email}</span> : null}
      </span>
      {onClick ? <ChevronDownIcon size={16} className={styles.userChevron} /> : null}
    </>
  )
  return onClick ? (
    <button
      type="button"
      className={cx(styles.user, styles.userButton, className)}
      onClick={onClick}
    >
      {body}
    </button>
  ) : (
    <div className={cx(styles.user, className)}>{body}</div>
  )
}

export interface SearchPillProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  /** Accessible name. Default "Search". */
  label?: string
  /** Shortcut hint shown at the end ("⌘K"). */
  shortcut?: ReactNode
}

/** The big rounded white search field of the header. */
export const SearchPill = forwardRef<HTMLInputElement, SearchPillProps>(function SearchPill(
  { label = 'Search', shortcut, className, placeholder = 'Search', ...rest },
  ref,
) {
  return (
    <label className={cx(styles.search, className)}>
      <SearchIcon size={18} className={styles.searchIcon} />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        className={styles.searchInput}
        {...rest}
      />
      {shortcut ? <kbd className={styles.shortcut}>{shortcut}</kbd> : null}
    </label>
  )
})

export interface AppFrameProps extends Omit<AppShellProps, 'topbar' | 'sidebarFooter'> {
  /** Signed-in person, shown at the left of the header. */
  user?: UserChipProps
  /** Search field in the header. Pass its props, or `false` for none. */
  search?: SearchPillProps | false
  /** Unread notifications: a lime badge on the bell. `0` shows no badge. */
  notifications?: number
  onNotificationsClick?: () => void
  /** Extra header controls after the bell (a theme switch, a help button). */
  headerEnd?: ReactNode
  /** Foot of the sidebar: usually a `PromoCard`, or an account block. */
  promo?: ReactNode
}

/**
 * The My-Trove app frame: a large floating rounded panel on a soft lime-tinted ground, a
 * near-black rounded sidebar (white pill on the current page, lime counts, a promo card at the
 * foot) and a header with the account chip, a search pill and the notification bell. Every
 * product dashboard sits inside it. Built on `AppShell`, so it keeps the skip link, the mobile
 * drawer and the landmarks.
 */
export const AppFrame = forwardRef<HTMLDivElement, AppFrameProps>(function AppFrame(
  { user, search, notifications = 0, onNotificationsClick, headerEnd, promo, children, ...shell },
  _ref,
) {
  const topbar = (
    <div className={styles.header}>
      {user ? <UserChip {...user} className={styles.headerUser} /> : null}
      {search === false ? (
        <span className={styles.grow} />
      ) : (
        <SearchPill {...(search ?? {})} className={styles.headerSearch} />
      )}
      <RoundIconButton
        label={notifications > 0 ? `Notifications, ${notifications} unread` : 'Notifications'}
        icon={<BellIcon size={20} />}
        tone="light"
        {...(notifications > 0 ? { badge: notifications } : {})}
        {...(onNotificationsClick ? { onClick: onNotificationsClick } : {})}
      />
      {headerEnd}
    </div>
  )
  return (
    <AppShell {...shell} topbar={topbar} {...(promo ? { sidebarFooter: promo } : {})}>
      {children}
    </AppShell>
  )
})
