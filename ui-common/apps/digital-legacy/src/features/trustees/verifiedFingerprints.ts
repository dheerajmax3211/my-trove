import { useCallback, useState } from 'react'

const STORAGE_KEY = 'dl.verified-fingerprints'

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * Remembers which public-key fingerprints the owner has compared with the trustee out of band.
 * Fingerprints are public values, so this is the one thing kept in browser storage; if it is
 * unavailable the owner is simply asked again.
 */
export function useVerifiedFingerprints() {
  const [verified, setVerified] = useState<string[]>(read)
  const mark = useCallback((fingerprint: string, value: boolean) => {
    setVerified((current) => {
      const next = value
        ? [...new Set([...current, fingerprint])]
        : current.filter((f) => f !== fingerprint)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* storage unavailable: the choice lasts for this page view only */
      }
      return next
    })
  }, [])
  const isVerified = useCallback(
    (fingerprint: string | null) => !!fingerprint && verified.includes(fingerprint),
    [verified],
  )
  return { isVerified, mark }
}
