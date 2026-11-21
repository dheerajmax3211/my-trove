/** auth-service `MeController.Profile`. `id` is the auth-service user id, not the Firebase uid. */
export interface Profile {
  id: string
  email: string | null
  displayName: string | null
  roles: string[]
}

/** auth-service `AuthUser`, returned by the admin endpoints. */
export interface AdminUser {
  id: string
  firebaseUid: string
  email: string | null
  displayName: string | null
  roles: string[]
}

export const ROLE_USER = 'USER'
export const ROLE_ADMIN = 'ADMIN'
/** The roles seeded by auth-service (there is no endpoint that lists them). */
export const KNOWN_ROLES = [ROLE_USER, ROLE_ADMIN] as const
