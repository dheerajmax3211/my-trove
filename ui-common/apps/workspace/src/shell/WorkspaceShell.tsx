import {
  AppShell,
  Badge,
  Button,
  Logo,
  PersonaBadge,
  SearchIcon,
  Select,
  useHotkey,
  useTheme,
  type ThemePreference,
} from '@platform/ui'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { primaryPersona } from '../lib/personas'
import { useWorkspace } from '../workspace/context'
import { CommandPaletteHost, hotkeyLabel } from './CommandPaletteHost'
import { Sidebar } from './Sidebar'
import { UserMenu } from './UserMenu'
import styles from './WorkspaceShell.module.css'

/** After a navigation, move focus to the page heading so keyboard and screen reader users land on the new page. */
function useFocusHeadingOnNavigate() {
  const { pathname } = useLocation()
  const previous = useRef(pathname)
  useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    const heading = document.querySelector<HTMLElement>('main h1')
    if (!heading) return
    heading.tabIndex = -1
    heading.focus({ preventScroll: false })
  }, [pathname])
}

function ThemeSelect() {
  const { theme, setTheme } = useTheme()
  return (
    <div className={styles.theme}>
      <Select
        size="sm"
        aria-label="Theme"
        value={theme}
        onChange={(event) => setTheme(event.target.value as ThemePreference)}
        style={{ width: 'auto' }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </Select>
    </div>
  )
}

function DemoFooter() {
  const { runtime } = useWorkspace()
  if (!runtime.demo) return null
  return (
    <p className={styles.demoNote}>
      <strong>Demo data.</strong> The people, items and numbers here are made up and stay in this
      browser tab.
    </p>
  )
}

/** The signed-in frame: vault sidebar, top bar (search, role, theme, account) and the page outlet. */
export function WorkspaceShell() {
  const session = useWorkspaceSession()
  const [paletteOpen, setPaletteOpen] = useState(false)
  useHotkey('mod+k', () => setPaletteOpen((open) => !open))
  useFocusHeadingOnNavigate()

  return (
    <>
      <AppShell
        brand={
          <Link to="/" className={styles.brand}>
            <Logo size="sm" />
          </Link>
        }
        sidebar={<Sidebar />}
        sidebarFooter={<DemoFooter />}
        topbar={
          <>
            <Button
              variant="secondary"
              size="sm"
              className={styles.search}
              leftIcon={<SearchIcon size={16} />}
              aria-label="Search the workspace"
              aria-keyshortcuts="Control+K Meta+K"
              onClick={() => setPaletteOpen(true)}
            >
              <span className={styles.searchText}>Search pages and actions</span>
              <kbd className={styles.kbd}>{hotkeyLabel()}</kbd>
            </Button>
            {session.isDemo ? <Badge variant="warning">Demo data</Badge> : null}
            <PersonaBadge persona={primaryPersona(session.roles)} className={styles.persona} />
            <ThemeSelect />
            <UserMenu />
          </>
        }
      >
        <Outlet />
      </AppShell>
      <CommandPaletteHost open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
