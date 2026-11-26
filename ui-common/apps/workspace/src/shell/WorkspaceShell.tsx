import {
  AppFrame,
  Button,
  ChatSparkIcon,
  Logo,
  PageTransition,
  PersonaBadge,
  PillSelect,
  PromoCard,
  SettingsIcon,
  useHotkey,
  useTheme,
  type ThemePreference,
} from '@platform/ui'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useOutlet } from 'react-router-dom'
import { ASSISTANT_PERMISSION, AssistantPanel } from '../assistant/AssistantPanel'
import { primaryPersona } from '../lib/personas'
import { canOpen, moduleBase } from '../modules/registry'
import { useOnboarding } from '../onboarding/OnboardingProvider'
import { useWorkspace } from '../workspace/context'
import { CommandPaletteHost, hotkeyLabel } from './CommandPaletteHost'
import { NotificationBell, useUnreadCount } from './NotificationBell'
import { PaletteContext } from './palette'
import { Sidebar } from './Sidebar'
import { UserMenu } from './UserMenu'
import styles from './WorkspaceShell.module.css'

/**
 * The page transition key: one per destination, not per URL. Moving between pages inside a product
 * keeps the product mounted (its state and caches survive); only a change of destination animates.
 */
export function transitionKey(pathname: string): string {
  const match = /^\/app\/[^/]+/.exec(pathname)
  return match ? match[0] : pathname
}

/** After a navigation, move focus to the page heading so keyboard and screen reader users land on the new page. */
function useFocusHeadingOnNavigate() {
  const { pathname } = useLocation()
  const previous = useRef(pathname)
  useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    // The outgoing page leaves first (about 140ms); wait until the new heading exists.
    let tries = 0
    const timer = window.setInterval(() => {
      tries += 1
      const heading = document.querySelector<HTMLElement>('main h1')
      if (heading || tries > 20) {
        window.clearInterval(timer)
        if (!heading) return
        heading.tabIndex = -1
        heading.focus({ preventScroll: false })
      }
    }, 40)
    return () => window.clearInterval(timer)
  }, [pathname])
}

function ThemePill() {
  const { theme, setTheme } = useTheme()
  return (
    <PillSelect
      className={styles.theme}
      label="Theme"
      icon={<SettingsIcon size={16} />}
      value={theme}
      onChange={(event) => setTheme(event.target.value as ThemePreference)}
      options={[
        { value: 'system', label: 'System' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ]}
    />
  )
}

/** The card at the foot of the sidebar: share a key where Consent is open to you, otherwise a tour. */
function Promo() {
  const { modules, runtime } = useWorkspace()
  const session = useWorkspaceSession()
  const onboarding = useOnboarding()
  const consent = modules.find((module) => module.id === 'consent')
  const canShare = consent !== undefined && canOpen(consent, session)
  return (
    <div className={styles.promoStack}>
      {runtime.demo ? (
        <p className={styles.demoNote}>
          <strong>Demo data.</strong> Made up, and kept in this tab only.
        </p>
      ) : null}
      {canShare ? (
        <PromoCard
          title="Share a key"
          description="Lend one document to one person, for as long as you choose."
          action={
            <Button asChild size="sm">
              <Link to={moduleBase(consent)}>Create a key</Link>
            </Button>
          }
        />
      ) : (
        <PromoCard
          title="Take the tour"
          description="Pin the products you use first and see one small step for each."
          action={
            <Button size="sm" onClick={onboarding.reopen}>
              Open the tour
            </Button>
          }
        />
      )}
    </div>
  )
}

/** The signed-in frame: the floating app frame, the sidebar, the header (account, search, bell) and the routed page. */
export function WorkspaceShell() {
  const session = useWorkspaceSession()
  const { modules, runtime } = useWorkspace()
  const live = runtime.mode === 'live'
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  // Only people who may use the MCP tools see the assistant at all (no teaser for anyone else).
  const canAsk = session.can(ASSISTANT_PERMISSION)
  const openAssistant = useCallback(() => setAssistantOpen(true), [])
  const askButton = useRef<HTMLButtonElement>(null)
  const onAssistantChange = useCallback((open: boolean) => {
    setAssistantOpen(open)
    // The panel has no trigger of its own (the palette can open it too), so focus goes back to the header button.
    if (!open) window.setTimeout(() => askButton.current?.focus(), 0)
  }, [])
  const closeInbox = useCallback(() => setInboxOpen(false), [])
  const unread = useUnreadCount({ enabled: live })
  // The menu is open for one page only: it closes by itself when the route changes.
  const [menuAt, setMenuAt] = useState<string | null>(null)
  const menuOpen = menuAt === pathname
  useHotkey('mod+k', () => setPaletteOpen((open) => !open))
  useFocusHeadingOnNavigate()

  const name = session.displayName ?? session.email ?? 'Account'

  return (
    <>
      <AppFrame
        brand={
          <Link to="/" className={styles.brand} aria-label="My-Trove home">
            <Logo size="sm" title="" className={styles.brandFull} />
            <Logo size="sm" variant="mark" title="" className={styles.brandMark} />
          </Link>
        }
        sidebar={<Sidebar />}
        promo={<Promo />}
        user={{
          name,
          ...(session.email && session.email !== name ? { email: session.email } : {}),
          onClick: () => setMenuAt(menuOpen ? null : pathname),
        }}
        search={{
          label: 'Search the workspace',
          placeholder: 'Search pages and actions',
          shortcut: hotkeyLabel(),
          readOnly: true,
          'aria-keyshortcuts': 'Control+K Meta+K',
          onClick: () => setPaletteOpen(true),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setPaletteOpen(true)
            }
          },
        }}
        notifications={unread}
        onNotificationsClick={() => setInboxOpen((open) => !open)}
        headerEnd={
          <>
            {session.isDemo ? (
              <span className={styles.demoPill} title="Made up, and kept in this tab only.">
                Demo data
              </span>
            ) : null}
            {canAsk ? (
              <Button
                ref={askButton}
                size="sm"
                variant="secondary"
                leftIcon={<ChatSparkIcon size={16} />}
                aria-label="Ask the assistant"
                aria-haspopup="dialog"
                onClick={openAssistant}
              >
                Ask
              </Button>
            ) : null}
            <PersonaBadge persona={primaryPersona(session.roles)} className={styles.persona} />
            <ThemePill />
            <UserMenu
              open={menuOpen}
              onOpenChange={(open) => setMenuAt(open ? pathname : null)}
              name={name}
            />
          </>
        }
      >
        <PaletteContext value={{ open: () => setPaletteOpen(true) }}>
          <PageTransition routeKey={transitionKey(pathname)} className={styles.pageWrap}>
            {outlet}
          </PageTransition>
        </PaletteContext>
      </AppFrame>
      <CommandPaletteHost
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        {...(canAsk ? { onAskAssistant: openAssistant } : {})}
      />
      {canAsk ? <AssistantPanel open={assistantOpen} onOpenChange={onAssistantChange} /> : null}
      <NotificationBell open={inboxOpen} onClose={closeInbox} modules={modules} enabled={live} />
    </>
  )
}
