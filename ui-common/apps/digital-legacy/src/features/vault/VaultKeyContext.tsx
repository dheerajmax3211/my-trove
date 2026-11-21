import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Bytes } from '../../crypto'

interface VaultKeyValue {
  /** The unlocked vault key, or null. Held in memory only: never written to any storage. */
  key: Bytes | null
  unlock: (key: Bytes) => void
  lock: () => void
}

const VaultKeyContext = createContext<VaultKeyValue | null>(null)

/**
 * Keeps the vault key in React state, and wipes it on lock. The provider lives inside the sign-in
 * gate, so signing out unmounts it and the cleanup below zeroes the key too.
 */
export function VaultKeyProvider({ children }: { children: ReactNode }) {
  const [key, setKey] = useState<Bytes | null>(null)
  const current = useRef<Bytes | null>(null)

  const replace = useCallback((next: Bytes | null) => {
    current.current?.fill(0)
    current.current = next
    setKey(next)
  }, [])
  const unlock = useCallback((next: Bytes) => replace(next), [replace])
  const lock = useCallback(() => replace(null), [replace])

  useEffect(
    () => () => {
      current.current?.fill(0)
    },
    [],
  )

  const value = useMemo(() => ({ key, unlock, lock }), [key, unlock, lock])
  return <VaultKeyContext value={value}>{children}</VaultKeyContext>
}

export function useVaultKey(): VaultKeyValue {
  const value = useContext(VaultKeyContext)
  if (!value) throw new Error('useVaultKey must be used within <VaultKeyProvider>')
  return value
}
