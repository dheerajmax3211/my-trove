import type { CSSProperties } from 'react'

/** BentoGrid hands its direct children a className and style (the entrance stagger); cards must pass them on. */
export interface Slot {
  className?: string
  style?: CSSProperties
}
