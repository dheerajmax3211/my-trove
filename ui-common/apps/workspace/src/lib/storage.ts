/** The slice of the Web Storage API the workspace uses; tests pass an in-memory one. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface Storages {
  /** Survives the tab: onboarding, pinned products, recent palette items. */
  local: StorageLike | null
  /** Lives as long as the tab: the demo-mode flag and the demo persona. */
  session: StorageLike | null
}

function pick(kind: 'localStorage' | 'sessionStorage'): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window[kind]
  } catch {
    return null // blocked storage (private mode, sandboxed frame)
  }
}

export function browserStorages(): Storages {
  return { local: pick('localStorage'), session: pick('sessionStorage') }
}

export function readItem(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeItem(storage: StorageLike | null, key: string, value: string | null): void {
  try {
    if (value === null) storage?.removeItem(key)
    else storage?.setItem(key, value)
  } catch {
    /* storage full or blocked: the preference just will not persist */
  }
}

export function readJson<T>(
  storage: StorageLike | null,
  key: string,
  guard: (value: unknown) => value is T,
): T | null {
  const raw = readItem(storage, key)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return guard(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** An in-memory storage (tests, and the fallback when the browser blocks storage). */
export function memoryStorage(): StorageLike {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}
