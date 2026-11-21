import { ApiProvider, createApiClient } from '@platform/api-client'
import {
  AppShell,
  Logo,
  PersonaBadge,
  Select,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  ThemeProvider,
  useTheme,
  type Persona,
  type ThemePreference,
} from '@platform/ui'
import '@platform/ui/styles.css'
import {
  ModuleBaseProvider,
  ModuleNavLink,
  WorkspaceSessionProvider,
  createSession,
} from '@platform/workspace-kit'
import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { createAdminDemoFetch } from '../src/demo/demoFetch'
import { DEMO_PEOPLE, DEMO_ROLES, demoId } from '../src/demo/seed'
import { adminModule } from '../src/index'

/**
 * Dev harness: mounts the admin module the way the workspace does (under `/app/admin`, one client bound to
 * `<gateway>/api/auth`, the demo fetch serving both services) with a persona switcher, so every screen can be
 * looked at without the workspace or any backend. Not shipped: only `pnpm --filter @platform/admin-console harness`.
 */
const PERSONAS: { persona: Persona; actor: number }[] = [
  { persona: 'OWNER', actor: 1 },
  { persona: 'ADMIN', actor: 2 },
  { persona: 'AUDITOR', actor: 3 },
  { persona: 'DEVELOPER', actor: 4 },
  { persona: 'MEMBER', actor: 5 },
]
const STORAGE = 'admin-harness-persona'
const BASE = '/app/admin'

function initialPersona(): Persona {
  const fromUrl = new URLSearchParams(window.location.search).get('persona')
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(STORAGE)
  } catch {
    /* storage unavailable: fall through */
  }
  const wanted = fromUrl ?? stored
  return PERSONAS.find((p) => p.persona === wanted)?.persona ?? 'OWNER'
}

function ThemeSelect() {
  const { theme, setTheme } = useTheme()
  return (
    <Select
      size="sm"
      aria-label="Theme"
      value={theme}
      onChange={(e) => setTheme(e.target.value as ThemePreference)}
      style={{ width: 'auto' }}
    >
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </Select>
  )
}

function Harness() {
  const [persona, setPersona] = useState<Persona>(initialPersona)
  const entry = PERSONAS.find((p) => p.persona === persona) ?? PERSONAS[0]!
  const person = DEMO_PEOPLE.find((p) => p.n === entry.actor)

  const session = useMemo(() => {
    const roles = persona === 'MEMBER' ? ['MEMBER'] : [persona, 'MEMBER']
    return createSession({
      uid: demoId(entry.actor),
      email: person?.email ?? null,
      displayName: person?.name ?? null,
      roles,
      permissions: [
        ...new Set(roles.flatMap((r) => DEMO_ROLES.find((d) => d.name === r)?.permissions ?? [])),
      ],
      plan: person?.plan ?? 'FREE',
      isDemo: true,
    })
  }, [persona, entry.actor, person])

  // One demo backend for the page's lifetime; the token says who is calling, so switching persona keeps the data.
  const demoFetch = useMemo(() => createAdminDemoFetch(), [])
  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: 'http://localhost:8080/api/auth',
        getToken: () => `demo:${session.roles.join('+')}:${entry.actor}`,
        fetch: demoFetch,
      }),
    [session, entry.actor, demoFetch],
  )

  return (
    <WorkspaceSessionProvider value={session}>
      {/* key: a new persona starts with a fresh query cache, as a new sign-in would */}
      <ApiProvider key={persona} client={client}>
        <ModuleBaseProvider base={BASE}>
          <AppShell
            brand={<Logo size="sm" />}
            sidebar={
              <SidebarNav label="Admin">
                <SidebarSection title="Admin">
                  {adminModule.nav
                    .filter((item) => !item.permission || session.can(item.permission))
                    .map((item) => (
                      <SidebarLink asChild key={item.to}>
                        <ModuleNavLink to={item.to} end={item.end ?? false}>
                          {item.icon ? <item.icon size={18} /> : null}
                          {item.label}
                        </ModuleNavLink>
                      </SidebarLink>
                    ))}
                </SidebarSection>
              </SidebarNav>
            }
            topbar={
              <>
                <PersonaBadge persona={persona} />
                <Select
                  size="sm"
                  aria-label="Persona"
                  value={persona}
                  style={{ width: 'auto' }}
                  onChange={(e) => {
                    const next = e.target.value as Persona
                    setPersona(next)
                    try {
                      window.localStorage.setItem(STORAGE, next)
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  {PERSONAS.map((p) => (
                    <option key={p.persona} value={p.persona}>
                      {p.persona.charAt(0) + p.persona.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
                <ThemeSelect />
              </>
            }
          >
            <adminModule.Routes />
          </AppShell>
        </ModuleBaseProvider>
      </ApiProvider>
    </WorkspaceSessionProvider>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path={`${BASE}/*`} element={<Harness />} />
          <Route path="*" element={<Navigate to={BASE} replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
