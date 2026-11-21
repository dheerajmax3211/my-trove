# @platform/auth-web

Firebase Auth for React web apps: a provider, hooks, a route guard, email-link and Google sign-in, and
Auth-emulator support. The React layer talks to an `AuthClient` interface, so Firebase is replaceable
(the package also ships an in-memory stub for demos and tests).

```tsx
import { AuthProvider, RequireAuth, getFirebaseConfigFromEnv, useAuth } from '@platform/auth-web'

;<AuthProvider config={getFirebaseConfigFromEnv(import.meta.env)}>
  <RequireAuth loading={<Spinner />} fallback={<SignInPage />}>
    <App />
  </RequireAuth>
</AuthProvider>
```

## API

- `AuthProvider` with `config` (Firebase) **or** `client` (any `AuthClient`). Completes an email sign-in link found in the
  URL automatically (once, StrictMode-safe) and cleans the query string.
- `useAuth()` → `{ status: 'loading'|'authenticated'|'unauthenticated', user, error, emailLinkPending,
signInWithGoogle, sendEmailLink, completeEmailLinkSignIn, signOut, getIdToken, clearError }`.
  Action functions never throw: they resolve `true` on success, or `false` and set `error`.
- `useIdToken()` → `{ token, loading, error, refresh }` (token as React state). For HTTP use `getIdToken` from `useAuth()`.
- `RequireAuth` – `loading`, `fallback` (render a sign-in page or `<Navigate to="/login" replace />`),
  `onUnauthenticated` callback. Router-agnostic.
- `createFirebaseAuthClient(config)`, `createStubAuthClient()`, `getFirebaseConfigFromEnv(env)`, `isFirebaseConfigured(env)`.

## Configuration (env)

See `.env.example`. All values are `VITE_FIREBASE_*` and come from the app's environment; nothing is committed.

| Variable                                                                                   | Notes                                                                        |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `VITE_FIREBASE_API_KEY`, `..._PROJECT_ID`                                                  | required unless the emulator host is set (demo values are used)              |
| `VITE_FIREBASE_AUTH_DOMAIN`, `..._APP_ID`, `..._STORAGE_BUCKET`, `..._MESSAGING_SENDER_ID` | optional                                                                     |
| `VITE_FIREBASE_AUTH_EMULATOR_HOST`                                                         | e.g. `127.0.0.1:9099`; connects to the Auth emulator, no real project needed |

Pass env explicitly (`getFirebaseConfigFromEnv(import.meta.env)`) so Vite can inline the values in the app bundle.

## Email-link sign-in

`sendEmailLink(email)` stores the address in `localStorage` (`pp.auth.emailForSignIn`). When the link opens on
the same device sign-in completes automatically. On another device `emailLinkPending` becomes `true`: ask for the
address and call `completeEmailLinkSignIn(email)`. Enable "Email link" in Firebase Console > Authentication.

## Testing

The provider is unit-tested against a fully mocked `firebase/app` + `firebase/auth` (see `src/*.test.tsx`).
In your own tests use `createStubAuthClient({ initialUser })`.
