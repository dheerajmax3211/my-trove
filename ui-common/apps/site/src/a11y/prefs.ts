import { useSyncExternalStore } from 'react'

export type TextSize = 'default' | 'large' | 'larger'

export interface A11yPrefs {
  textSize: TextSize
  highContrast: boolean
  reduceMotion: boolean
}

export const STORAGE_KEY = 'pp-site-a11y'
const DEFAULTS: A11yPrefs = { textSize: 'default', highContrast: false, reduceMotion: false }
const SCALE: Record<TextSize, string> = { default: '100%', large: '112.5%', larger: '125%' }

function read(): A11yPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<A11yPrefs>
    return {
      textSize:
        parsed.textSize === 'large' || parsed.textSize === 'larger' ? parsed.textSize : 'default',
      highContrast: parsed.highContrast === true,
      reduceMotion: parsed.reduceMotion === true,
    }
  } catch {
    return DEFAULTS
  }
}

let current: A11yPrefs = typeof window === 'undefined' ? DEFAULTS : read()
const subscribers = new Set<() => void>()
/** Listeners that components registered on the reduced-motion media query. */
const motionListeners = new Set<(event: MediaQueryListEvent) => void>()

/** Write the preferences onto <html> so CSS (and the text size) can react. */
export function applyPrefs(prefs: A11yPrefs = current): void {
  const root = document.documentElement
  root.style.fontSize = SCALE[prefs.textSize]
  if (prefs.highContrast) root.setAttribute('data-contrast', 'high')
  else root.removeAttribute('data-contrast')
  if (prefs.reduceMotion) root.setAttribute('data-motion', 'reduce')
  else root.removeAttribute('data-motion')
}

export function getPrefs(): A11yPrefs {
  return current
}

export function setPrefs(patch: Partial<A11yPrefs>): void {
  const motionChanged =
    patch.reduceMotion !== undefined && patch.reduceMotion !== current.reduceMotion
  current = { ...current, ...patch }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Private mode or blocked storage: the choice still applies for this visit.
  }
  applyPrefs()
  if (motionChanged) {
    for (const listener of motionListeners) {
      listener({ matches: current.reduceMotion } as MediaQueryListEvent)
    }
  }
  for (const notify of subscribers) notify()
}

export function resetPrefs(): void {
  setPrefs(DEFAULTS)
}

export function usePrefs(): A11yPrefs {
  return useSyncExternalStore(
    (notify) => {
      subscribers.add(notify)
      return () => subscribers.delete(notify)
    },
    getPrefs,
    () => DEFAULTS,
  )
}

const REDUCE_QUERY = /prefers-reduced-motion:\s*reduce/

/**
 * Makes the "Reduce motion" switch reach every motion primitive. `@platform/ui` reads the
 * `prefers-reduced-motion` media query through `matchMedia`; this wraps `matchMedia` so that query
 * also reports `true` while the visitor has turned the switch on, and notifies listeners when it
 * changes. The operating-system setting still works as before.
 */
export function installMotionPreference(): void {
  applyPrefs()
  if (typeof window.matchMedia !== 'function') return
  const original = window.matchMedia.bind(window)
  window.matchMedia = (query: string): MediaQueryList => {
    const real = original(query)
    if (!REDUCE_QUERY.test(query)) return real
    return new Proxy(real, {
      get(target, prop) {
        if (prop === 'matches') return current.reduceMotion || target.matches
        if (prop === 'addEventListener') {
          return (type: string, listener: EventListenerOrEventListenerObject, opts?: unknown) => {
            if (type === 'change' && typeof listener === 'function') {
              motionListeners.add(listener)
            }
            target.addEventListener(type, listener, opts as AddEventListenerOptions)
          }
        }
        if (prop === 'removeEventListener') {
          return (type: string, listener: EventListenerOrEventListenerObject, opts?: unknown) => {
            motionListeners.delete(listener as (event: MediaQueryListEvent) => void)
            target.removeEventListener(type, listener, opts as EventListenerOptions)
          }
        }
        const value: unknown = Reflect.get(target, prop, target)
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value
      },
    })
  }
}
