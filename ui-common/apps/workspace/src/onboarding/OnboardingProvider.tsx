import { useWorkspaceSession } from '@platform/workspace-kit'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { readJson, writeItem } from '../lib/storage'
import { useWorkspace } from '../workspace/context'

export type OnboardingStatus = 'pending' | 'done' | 'skipped'

interface Stored {
  status: Exclude<OnboardingStatus, 'pending'>
  pinned: string[]
}

export interface OnboardingValue {
  status: OnboardingStatus
  /** Ids of the products the user pinned, in the order picked. */
  pinned: readonly string[]
  /** True while the wizard should be on screen: first sign-in, or re-opened from Account. */
  open: boolean
  reopen: () => void
  /** Save the choice and close. */
  complete: (pinned: readonly string[]) => void
  /** Close without changing what was pinned. The first time, it also records that the user skipped. */
  skip: () => void
}

const OnboardingContext = createContext<OnboardingValue | null>(null)

export const onboardingKey = (uid: string) => `pp.workspace.onboarding.v1.${uid}`

const isStored = (value: unknown): value is Stored => {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    (v.status === 'done' || v.status === 'skipped') &&
    Array.isArray(v.pinned) &&
    v.pinned.every((id) => typeof id === 'string')
  )
}

/** First-sign-in state, kept per user in localStorage so a shared browser never mixes people up. */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { runtime } = useWorkspace()
  const { uid } = useWorkspaceSession()
  const key = onboardingKey(uid)
  const [stored, setStored] = useState<Stored | null>(() =>
    readJson(runtime.storage.local, key, isStored),
  )
  const [reopened, setReopened] = useState(false)

  const save = useCallback(
    (next: Stored) => {
      setStored(next)
      writeItem(runtime.storage.local, key, JSON.stringify(next))
    },
    [runtime.storage.local, key],
  )

  const value = useMemo<OnboardingValue>(
    () => ({
      status: stored?.status ?? 'pending',
      pinned: stored?.pinned ?? [],
      open: stored === null || reopened,
      reopen: () => setReopened(true),
      complete: (pinned) => {
        save({ status: 'done', pinned: [...pinned] })
        setReopened(false)
      },
      skip: () => {
        if (stored === null) save({ status: 'skipped', pinned: [] })
        setReopened(false)
      },
    }),
    [stored, reopened, save],
  )

  return <OnboardingContext value={value}>{children}</OnboardingContext>
}

export function useOnboarding(): OnboardingValue {
  const value = useContext(OnboardingContext)
  if (!value) throw new Error('useOnboarding must be used within <OnboardingProvider>')
  return value
}
