import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  /** What the user chose. */
  theme: ThemePreference
  /** What is actually showing. */
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const DARK_QUERY = '(prefers-color-scheme: dark)'

function readStored(key: string): ThemePreference | null {
  try {
    const value = window.localStorage.getItem(key)
    return value === 'light' || value === 'dark' || value === 'system' ? value : null
  } catch {
    return null
  }
}

function systemTheme(): 'light' | 'dark' {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches
    ? 'dark'
    : 'light'
}

export interface ThemeProviderProps {
  defaultTheme?: ThemePreference
  /** localStorage key used to remember the choice. Pass `null` to disable persistence. */
  storageKey?: string | null
  children: ReactNode
}

/**
 * Applies the user's theme choice by setting `data-theme` on <html> ("system" removes the
 * attribute so `prefers-color-scheme` decides). Tokens CSS does the rest.
 */
export function ThemeProvider({
  defaultTheme = 'system',
  storageKey = 'pp-theme',
  children,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemePreference>(
    () => (storageKey ? readStored(storageKey) : null) ?? defaultTheme,
  )
  const [system, setSystem] = useState<'light' | 'dark'>(systemTheme)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(DARK_QUERY)
    const onChange = () => setSystem(media.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setThemeState(next)
      if (!storageKey) return
      try {
        window.localStorage.setItem(storageKey, next)
      } catch {
        /* storage unavailable (private mode): the choice just will not persist */
      }
    },
    [storageKey],
  )

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme: theme === 'system' ? system : theme, setTheme }),
    [theme, system, setTheme],
  )
  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>')
  return ctx
}
