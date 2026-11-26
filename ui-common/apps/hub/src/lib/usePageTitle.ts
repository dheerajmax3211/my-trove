import { useEffect } from 'react'

/** Sets the browser tab title for the current screen, e.g. "Reminders - Household". */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} - Household`
  }, [title])
}
