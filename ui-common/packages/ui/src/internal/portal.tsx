import { createContext, useContext, type ReactNode } from 'react'

const PortalContainerContext = createContext<HTMLElement | null>(null)

export interface PortalContainerProviderProps {
  /** Element that overlays (Dialog, Tooltip, Toast, Drawer) render into. `null` = document.body. */
  container: HTMLElement | null
  children: ReactNode
}

/**
 * Lets a subtree decide where overlays portal to. Overlays inherit CSS variables from their
 * portal container, so this is how the gallery shows a dark-mode dialog next to a light one,
 * and how an app can scope overlays inside a `data-theme` region or a shadow root.
 */
export function PortalContainerProvider({ container, children }: PortalContainerProviderProps) {
  return <PortalContainerContext value={container}>{children}</PortalContainerContext>
}

export function usePortalContainer(): HTMLElement | null {
  return useContext(PortalContainerContext)
}
