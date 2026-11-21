import { useModuleBase } from '@platform/workspace-kit'
import { useEffect } from 'react'

/** Sets the browser tab title for the current screen: "Reminders - Household" in the workspace, "- Hub" standalone. */
export function usePageTitle(title: string): void {
  const suffix = useModuleBase() === '' ? 'Hub' : 'Household'
  useEffect(() => {
    document.title = `${title} - ${suffix}`
  }, [title, suffix])
}
