export {
  AuthProvider,
  useAuth,
  type AuthContextValue,
  type AuthProviderProps,
} from './AuthProvider'
export { RequireAuth, type RequireAuthProps } from './RequireAuth'
export { useIdToken, type UseIdTokenResult } from './useIdToken'
export { getFirebaseConfigFromEnv, isFirebaseConfigured, type FirebaseAuthConfig } from './config'
export { createFirebaseAuthClient, EMAIL_STORAGE_KEY } from './firebaseClient'
export {
  DEV_IDP_DEFAULT_EMAIL,
  DEV_IDP_STORAGE_KEY,
  createDevIdpAuthClient,
  type DevIdpAuthClientOptions,
} from './devIdpClient'
export {
  DEMO_USER,
  createStubAuthClient,
  type StubAuthClient,
  type StubAuthClientOptions,
} from './stubClient'
export {
  AuthClientError,
  type AuthClient,
  type AuthStatus,
  type AuthUser,
  type Unsubscribe,
} from './types'
