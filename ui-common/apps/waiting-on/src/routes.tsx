import { useEffect, useRef } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { ItemDetailPage } from './features/items/pages/ItemDetailPage'
import { ItemsPage } from './features/items/pages/ItemsPage'
import { NewItemPage } from './features/items/pages/NewItemPage'
import { NotFoundPage } from './features/items/pages/NotFoundPage'

import './app.css'
/** Moves focus to the page heading after each navigation so keyboard and screen reader users land on the new page. */
function useFocusHeadingOnNavigate() {
  const { pathname } = useLocation()
  const previous = useRef(pathname)
  useEffect(() => {
    if (previous.current === pathname) return // first render: leave focus where the browser put it
    previous.current = pathname
    const heading = document.querySelector<HTMLElement>('main h1')
    if (!heading) return
    heading.tabIndex = -1
    heading.focus({ preventScroll: false })
  }, [pathname])
}

/**
 * The product's pages, without providers, sign-in or layout. Every path is relative, so the same tree
 * runs standalone (base empty) and inside the workspace (base `/app/waiting-on`).
 */
export function WaitingOnRoutes() {
  useFocusHeadingOnNavigate()
  return (
    <Routes>
      <Route index element={<ItemsPage />} />
      <Route path="new" element={<NewItemPage />} />
      <Route path="items/:id" element={<ItemDetailPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
