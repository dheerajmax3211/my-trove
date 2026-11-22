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
  DEV_ACCOUNTS,
  DEV_IDP_DEFAULT_EMAIL,
  DEV_IDP_LINK_EMAIL_KEY,
  DEV_IDP_STORAGE_KEY,
  createDevIdpAuthClient,
  type DevIdpAuthClientOptions,
} from './devIdpClient'
export { UNCONFIGURED_MESSAGE, createUnconfiguredAuthClient } from './unconfiguredClient'
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
  type DevAccount,
  type DevSignIn,
  type Unsubscribe,
} from './types'
