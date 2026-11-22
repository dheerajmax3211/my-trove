import { createContext, useContext } from 'react'

/** Lets any page open the command palette (the shell owns it). */
export const PaletteContext = createContext<{ open: () => void }>({ open: () => undefined })

export function usePalette() {
  return useContext(PaletteContext)
}
