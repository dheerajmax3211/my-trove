import { useReducedMotion } from '@platform/ui'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

interface Playback {
  /** True while decorative motion (aurora, orbits) should run. */
  playing: boolean
  toggle: () => void
  /** The visitor (or their system) asked for no motion: the control is moot. */
  reduced: boolean
}

const PlaybackContext = createContext<Playback>({ playing: true, toggle: () => {}, reduced: false })

/** Shared state for the hero's play and pause control, so the hero and the closing band agree. */
export function PlaybackProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const value = useMemo<Playback>(
    () => ({ playing: !paused && !reduced, toggle: () => setPaused((p) => !p), reduced }),
    [paused, reduced],
  )
  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>
}

export function usePlayback(): Playback {
  return useContext(PlaybackContext)
}
