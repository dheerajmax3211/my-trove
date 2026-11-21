import { Dialog as DialogPrimitive, Slot } from 'radix-ui'
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { cx } from '../../internal/cx'
import { CloseIcon, MenuIcon } from '../../internal/icons'
import { usePortalContainer } from '../../internal/portal'
import { IconButton } from '../IconButton/IconButton'
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden'
import styles from './AppShell.module.css'

interface AppShellContextValue {
  closeDrawer: () => void
}
const AppShellContext = createContext<AppShellContextValue>({ closeDrawer: () => {} })

/** Breakpoint (px) at which the sidebar is docked. Keep in sync with AppShell.module.css. */
const DESKTOP_QUERY = '(min-width: 768px)'

export interface AppShellProps {
  /** Logo / product name. Shown at the top of the sidebar and in the top bar on mobile. */
  brand: ReactNode
  /** Navigation content, typically <SidebarNav>. Docked on desktop, shown in a drawer on mobile. */
  sidebar: ReactNode
  /** Shown at the bottom of the sidebar (e.g. account menu). */
  sidebarFooter?: ReactNode
  /** Right-aligned top bar content (search, user menu, actions). */
  topbar?: ReactNode
  /** Accessible name of the drawer dialog. Default "Navigation". */
  drawerLabel?: string
  menuLabel?: string
  closeMenuLabel?: string
  skipLinkLabel?: string
  drawerOpen?: boolean
  defaultDrawerOpen?: boolean
  onDrawerOpenChange?: (open: boolean) => void
  className?: string
  children: ReactNode
}

/**
 * Application frame: skip link, docked sidebar (>= 768px) or off-canvas drawer (below), sticky
 * top bar and a <main> landmark. The drawer is a modal dialog: focus is trapped, Escape closes it
 * and focus returns to the menu button.
 */
export function AppShell({
  brand,
  sidebar,
  sidebarFooter,
  topbar,
  drawerLabel = 'Navigation',
  menuLabel = 'Open navigation menu',
  closeMenuLabel = 'Close navigation menu',
  skipLinkLabel = 'Skip to main content',
  drawerOpen,
  defaultDrawerOpen = false,
  onDrawerOpenChange,
  className,
  children,
}: AppShellProps) {
  const [internalOpen, setInternalOpen] = useState(defaultDrawerOpen)
  const open = drawerOpen ?? internalOpen
  const container = usePortalContainer()
  const mainId = `${useId()}-main`

  const setOpen = useCallback(
    (next: boolean) => {
      if (drawerOpen === undefined) setInternalOpen(next)
      onDrawerOpenChange?.(next)
    },
    [drawerOpen, onDrawerOpenChange],
  )

  // If the viewport grows past the breakpoint while the drawer is open, close it (the docked sidebar takes over).
  useEffect(() => {
    if (!open || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(DESKTOP_QUERY)
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [open, setOpen])

  const context = useMemo<AppShellContextValue>(
    () => ({ closeDrawer: () => setOpen(false) }),
    [setOpen],
  )

  return (
    <AppShellContext value={context}>
      <div className={cx(styles.shell, className)}>
        <a className={styles.skip} href={`#${mainId}`}>
          {skipLinkLabel}
        </a>

        <aside className={cx(styles.sidebar, 'pp-grain')} data-surface="vault">
          <div className={styles.brand}>{brand}</div>
          <div className={styles.sidebarBody}>{sidebar}</div>
          {sidebarFooter ? <div className={styles.sidebarFooter}>{sidebarFooter}</div> : null}
        </aside>

        <div className={styles.column}>
          <header className={styles.topbar}>
            <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
              <DialogPrimitive.Trigger asChild>
                <IconButton className={styles.menuButton} label={menuLabel} icon={<MenuIcon />} />
              </DialogPrimitive.Trigger>
              <DialogPrimitive.Portal container={container}>
                <DialogPrimitive.Overlay className={styles.drawerOverlay} />
                <DialogPrimitive.Content
                  className={styles.drawer}
                  data-surface="vault"
                  aria-describedby={undefined}
                >
                  <VisuallyHidden asChild>
                    <DialogPrimitive.Title>{drawerLabel}</DialogPrimitive.Title>
                  </VisuallyHidden>
                  <div className={styles.drawerHeader}>
                    <div className={styles.brand}>{brand}</div>
                    <DialogPrimitive.Close asChild>
                      <IconButton label={closeMenuLabel} icon={<CloseIcon />} />
                    </DialogPrimitive.Close>
                  </div>
                  {sidebar}
                  {sidebarFooter ? (
                    <div className={styles.sidebarFooter}>{sidebarFooter}</div>
                  ) : null}
                </DialogPrimitive.Content>
              </DialogPrimitive.Portal>
            </DialogPrimitive.Root>
            <div className={styles.mobileBrand}>{brand}</div>
            <div className={styles.topbarContent}>{topbar}</div>
          </header>
          <main id={mainId} className={styles.main} tabIndex={-1}>
            <div className={styles.mainInner}>{children}</div>
          </main>
        </div>
      </div>
    </AppShellContext>
  )
}

export interface SidebarNavProps extends HTMLAttributes<HTMLElement> {
  /** Accessible name of the navigation landmark. Default "Primary". */
  label?: string
}

export const SidebarNav = forwardRef<HTMLElement, SidebarNavProps>(function SidebarNav(
  { label = 'Primary', className, ...rest },
  ref,
) {
  return <nav ref={ref} aria-label={label} className={cx(styles.nav, className)} {...rest} />
})

export interface SidebarSectionProps extends HTMLAttributes<HTMLDivElement> {
  title?: string
}

export function SidebarSection({ title, className, children, ...rest }: SidebarSectionProps) {
  const id = useId()
  return (
    <div className={cx(styles.section, className)} {...rest}>
      {title ? (
        <div id={id} className={styles.sectionTitle}>
          {title}
        </div>
      ) : null}
      <ul className={styles.list} aria-labelledby={title ? id : undefined}>
        {children}
      </ul>
    </div>
  )
}

export interface SidebarLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  icon?: ReactNode
  /** Marks the current page (aria-current="page"). */
  active?: boolean
  /** Render a router link instead: <SidebarLink asChild><Link to="/x">X</Link></SidebarLink>. `icon` is then ignored; put it inside your link. */
  asChild?: boolean
}

export const SidebarLink = forwardRef<HTMLAnchorElement, SidebarLinkProps>(function SidebarLink(
  { icon, active, asChild, className, children, onClick, ...rest },
  ref,
) {
  const { closeDrawer } = useContext(AppShellContext)
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (!event.defaultPrevented) closeDrawer()
  }
  const common = {
    ref,
    className: cx(styles.link, className),
    'aria-current': active ? ('page' as const) : undefined,
    onClick: handleClick,
    ...rest,
  }
  return (
    <li>
      {asChild ? (
        <Slot.Root {...common}>{children}</Slot.Root>
      ) : (
        <a {...common}>
          {icon ? (
            <span className={styles.linkIcon} aria-hidden="true">
              {icon}
            </span>
          ) : null}
          {children}
        </a>
      )}
    </li>
  )
})
