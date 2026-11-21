import { Route, Routes } from 'react-router-dom'
import { SiteLayout } from './layout/SiteLayout'
import { About } from './pages/About'
import { Docs } from './pages/Docs'
import { Home } from './pages/Home'
import { NotFound } from './pages/NotFound'
import { Platform } from './pages/Platform'
import { Pricing } from './pages/Pricing'
import { Product } from './pages/Product'
import { Security } from './pages/Security'

/** The route table. Wrap it in a router and a ThemeProvider (see main.tsx). */
export function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<Home />} />
        <Route path="products/:id" element={<Product />} />
        <Route path="platform" element={<Platform />} />
        <Route path="security" element={<Security />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="docs" element={<Docs />} />
        <Route path="about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
