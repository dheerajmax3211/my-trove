import { useEffect } from 'react'

export interface PageMeta {
  /** The full document title. Every page has its own. */
  title: string
  /** One or two sentences for search results and link previews. */
  description: string
  /** Keep the page out of search results (the 404 page). */
  noindex?: boolean
}

function setMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function removeMeta(attr: 'name' | 'property', key: string): void {
  document.head.querySelector(`meta[${attr}="${key}"]`)?.remove()
}

/**
 * Sets the document title and the description, Open Graph and Twitter text for the current page.
 * The static tags in index.html cover crawlers that do not run scripts; this keeps the tab title,
 * history entries and script-aware crawlers accurate per route.
 */
export function usePageMeta({ title, description, noindex = false }: PageMeta): void {
  useEffect(() => {
    document.title = title
    setMeta('name', 'description', description)
    setMeta('property', 'og:title', title)
    setMeta('property', 'og:description', description)
    setMeta('name', 'twitter:title', title)
    setMeta('name', 'twitter:description', description)
    if (noindex) setMeta('name', 'robots', 'noindex')
    else removeMeta('name', 'robots')
  }, [title, description, noindex])
}
