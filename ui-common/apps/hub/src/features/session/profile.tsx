import { createContext, useContext } from 'react'
import { ROLE_ADMIN, type Profile } from './types'

export const ProfileContext = createContext<Profile | null>(null)

/** The signed-in user's auth-service profile. Only available below <SessionGate>. */
export function useProfile(): Profile {
  const profile = useContext(ProfileContext)
  if (!profile) throw new Error('useProfile must be used within <SessionGate>')
  return profile
}

export const isAdmin = (profile: Profile): boolean => profile.roles.includes(ROLE_ADMIN)
