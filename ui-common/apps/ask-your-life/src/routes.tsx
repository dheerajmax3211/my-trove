import { useModuleNavigate, useModulePath } from '@platform/workspace-kit'
import { useCallback } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AddPage } from './features/documents/pages/AddPage'
import { LibraryPage } from './features/documents/pages/LibraryPage'
import { SearchPage } from './features/search/pages/SearchPage'
import { useSlashShortcut } from './lib/useSlashShortcut'

const trimSlash = (path: string): string => (path.length > 1 ? path.replace(/\/+$/, '') : path)

/** "/" jumps to search from any page of the product. (The search page focuses its own box.) */
function SlashToSearch() {
  const { pathname } = useLocation()
  const modulePath = useModulePath()
  const navigate = useModuleNavigate()
  useSlashShortcut(
    useCallback(() => {
      if (trimSlash(pathname) !== trimSlash(modulePath('/'))) navigate('/')
    }, [pathname, modulePath, navigate]),
  )
  return <Outlet />
}

/**
 * The product's three screens. Every path is relative to wherever the product is mounted: at the root
 * in the standalone app, under `/app/ask-your-life` in the workspace. It brings no providers, sign-in
 * or page frame, so both hosts can wrap it as they need.
 */
export function ProductRoutes() {
  const home = useModulePath()('/')
  return (
    <Routes>
      <Route element={<SlashToSearch />}>
        <Route index element={<SearchPage />} />
        <Route path="add" element={<AddPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  )
}
