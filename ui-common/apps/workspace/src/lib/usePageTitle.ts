import { useEffect } from 'react'

/** Sets the browser tab title for the current page ("Today - My-Trove"). */
export function usePageTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = `${title} - My-Trove`
    return () => {
      document.title = previous
    }
  }, [title])
}
