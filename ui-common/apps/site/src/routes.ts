import { matchPath } from 'react-router-dom'
import { productIds } from './content/products'

/** Every path pattern the site answers. The 404 page answers everything else. */
export const ROUTE_PATTERNS = [
  '/',
  '/products/:id',
  '/platform',
  '/security',
  '/pricing',
  '/docs',
  '/about',
] as const

export function productPath(id: string): string {
  return `/products/${id}`
}

/** All concrete paths (used by the tests and to keep the sitemap honest). */
export const allPaths: readonly string[] = [
  '/',
  ...productIds.map(productPath),
  '/platform',
  '/security',
  '/pricing',
  '/docs',
  '/about',
]

/** True when `path` (no hash or query) is a page this site renders, not the 404 page. */
export function isKnownPath(path: string): boolean {
  const clean = path.replace(/\/+$/, '') || '/'
  const product = matchPath('/products/:id', clean)
  if (product) return (productIds as readonly string[]).includes(product.params.id ?? '')
  return ROUTE_PATTERNS.some((pattern) => pattern !== '/products/:id' && matchPath(pattern, clean))
}
