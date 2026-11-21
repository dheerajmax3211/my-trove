import {
  AppShell,
  InboxIcon,
  Select,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  Spinner,
  ThemeProvider,
  useTheme,
  type ThemePreference,
} from '@platform/ui'
import { lazy, Suspense } from 'react'
import { HashRouter, Link, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { Overview } from './pages/Overview'
import { ComponentPage } from './pages/ComponentPage'
import { TokensPage } from './pages/TokensPage'
import { componentDocs, PreviewShell } from './registry'

// The demo pulls in Firebase and TanStack Query; load it only when its route is visited.
const DemoApp = lazy(() => import('./demo/DemoApp').then((m) => ({ default: m.DemoApp })))

function ThemeSelect() {
  const { theme, setTheme } = useTheme()
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 'var(--pp-text-body-small-size)',
      }}
    >
      <span className="hide-sm">Page theme</span>
      <Select
        size="sm"
        aria-label="Page theme"
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemePreference)}
        style={{ width: 'auto' }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </Select>
    </div>
  )
}

function GalleryLink({ to, end, children }: { to: string; end?: boolean; children: string }) {
  return (
    <SidebarLink asChild>
      <NavLink to={to} end={end ?? false}>
        {children}
      </NavLink>
    </SidebarLink>
  )
}

function GalleryLayout() {
  return (
    <AppShell
      brand={
        <Link
          to="/"
          style={{
            color: 'inherit',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <InboxIcon /> Platform UI
        </Link>
      }
      sidebar={
        <SidebarNav label="Gallery">
          <SidebarSection title="Foundations">
            <GalleryLink to="/" end>
              Overview
            </GalleryLink>
            <GalleryLink to="/tokens">Tokens</GalleryLink>
          </SidebarSection>
          <SidebarSection title="Components">
            {componentDocs.map((doc) => (
              <GalleryLink key={doc.slug} to={`/components/${doc.slug}`}>
                {doc.title}
              </GalleryLink>
            ))}
          </SidebarSection>
          <SidebarSection title="Demo">
            <GalleryLink to="/demo">Signed-in shell</GalleryLink>
          </SidebarSection>
        </SidebarNav>
      }
      topbar={<ThemeSelect />}
    >
      <Outlet />
    </AppShell>
  )
}

export function App() {
  return (
    <ThemeProvider>
      <HashRouter>
        <Routes>
          <Route element={<GalleryLayout />}>
            <Route index element={<Overview />} />
            <Route path="tokens" element={<TokensPage />} />
            <Route path="components/:slug" element={<ComponentPage />} />
          </Route>
          <Route
            path="demo/*"
            element={
              <Suspense fallback={<Spinner size={32} label="Loading demo" />}>
                <DemoApp />
              </Suspense>
            }
          />
          <Route path="preview" element={<PreviewShell />} />
          <Route path="*" element={<GalleryLayout />}>
            <Route path="*" element={<Overview />} />
          </Route>
        </Routes>
      </HashRouter>
    </ThemeProvider>
  )
}
