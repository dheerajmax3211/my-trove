import { useAuth } from '@platform/auth-web'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCoreEnv } from './env'

/**
 * shared-service knows people only by their sign-in uid. This turns a uid into something a person can read:
 * "You" for the signed-in user, a name the user gave them on this device, a name the host knows (the demo
 * cast), and otherwise a short stable label such as "Member 3fK9".
 */
export interface People {
  /** The signed-in user's uid, or undefined before sign-in. */
  selfUid: string | undefined
  isSelf: (uid: string) => boolean
  /** "You", a nickname, a directory name or "Member abcd". */
  nameOf: (uid: string) => string
  /** The name without the "You" shortcut, for avatars and places that read "Rename Bob". */
  plainNameOf: (uid: string) => string
  nicknameOf: (uid: string) => string | undefined
  setNickname: (uid: string, name: string) => void
}

const STORAGE_PREFIX = 'pp.core.people.'

function readNicknames(key: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  } catch {
    return {}
  }
}

function writeNicknames(key: string, value: Record<string, string>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage can be blocked; the name then lasts until the page closes */
  }
}

export const memberLabel = (uid: string): string => `Member ${uid.slice(-4)}`

export function usePeople(): People {
  const { user } = useAuth()
  const { directory } = useCoreEnv()
  const selfUid = user?.uid
  const storageKey = `${STORAGE_PREFIX}${selfUid ?? 'anonymous'}`
  const [nicknames, setNicknames] = useState<Record<string, string>>(() => readNicknames(storageKey))

  useEffect(() => {
    setNicknames(readNicknames(storageKey))
  }, [storageKey])

  const setNickname = useCallback(
    (uid: string, name: string) => {
      setNicknames((current) => {
        const next = { ...current }
        const trimmed = name.trim()
        if (trimmed) next[uid] = trimmed
        else delete next[uid]
        writeNicknames(storageKey, next)
        return next
      })
    },
    [storageKey],
  )

  return useMemo(() => {
    const selfName = user?.displayName?.trim() || user?.email || 'You'
    const plainNameOf = (uid: string) =>
      uid === selfUid ? selfName : (nicknames[uid] ?? directory[uid] ?? memberLabel(uid))
    return {
      selfUid,
      isSelf: (uid) => uid === selfUid,
      plainNameOf,
      nameOf: (uid) => (uid === selfUid ? 'You' : plainNameOf(uid)),
      nicknameOf: (uid) => nicknames[uid],
      setNickname,
    }
  }, [selfUid, user?.displayName, user?.email, nicknames, directory, setNickname])
}
