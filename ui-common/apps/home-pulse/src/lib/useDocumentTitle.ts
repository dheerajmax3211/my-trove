import { useEffect } from 'react'

/** Sets the browser tab title for the current screen ("Alerts - Home Pulse"). */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} - Home Pulse`
  }, [title])
}
