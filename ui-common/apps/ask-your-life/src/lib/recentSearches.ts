import { useWorkspaceSession } from '@platform/workspace-kit'
import { useCallback, useState } from 'react'

export const MAX_RECENT = 6

const keyFor = (uid: string): string => `ask-your-life:recent:${uid}`

const tidy = (query: string): string => query.trim().replace(/\s+/g, ' ')

/** Newest first, no repeats (ignoring case and spacing), at most `MAX_RECENT`. */
export function pushRecent(list: readonly string[], query: string): string[] {
  const q = tidy(query)
  if (q === '') return [...list]
  return [q, ...list.filter((item) => tidy(item).toLowerCase() !== q.toLowerCase())].slice(
    0,
    MAX_RECENT,
  )
}

function read(uid: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(keyFor(uid)) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT)
      : []
  } catch {
    return []
  }
}

function write(uid: string, list: readonly string[]): void {
  try {
    if (list.length === 0) window.localStorage.removeItem(keyFor(uid))
    else window.localStorage.setItem(keyFor(uid), JSON.stringify(list))
  } catch {
    // Private mode or storage disabled: recent searches just do not persist.
  }
}

/**
 * The person's last few searches. They stay in this browser (never sent anywhere) and are kept
 * apart per signed-in user.
 */
export function useRecentSearches() {
  const { uid } = useWorkspaceSession()
  const [state, setState] = useState(() => ({ uid, items: read(uid) }))
  // Someone else signed in on this browser: show their searches, not the previous person's.
  if (state.uid !== uid) setState({ uid, items: read(uid) })

  const remember = useCallback(
    (query: string) =>
      setState((current) => {
        const items = pushRecent(current.items, query)
        write(current.uid, items)
        return { ...current, items }
      }),
    [],
  )
  const clear = useCallback(
    () =>
      setState((current) => {
        write(current.uid, [])
        return { ...current, items: [] }
      }),
    [],
  )
  return { recent: state.items, remember, clear }
}
