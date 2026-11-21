import { useEffect } from 'react'

/** Sets the browser tab title for the current screen. */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} - Hub`
  }, [title])
}
