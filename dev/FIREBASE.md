# Switching to a real Firebase project

Everything is already wired for it: the services verify Firebase ID tokens (Google's JWKS, issuer, audience) and the
apps use the Firebase JS SDK. What is missing is a project, which only you can create.

## 1. Create the project (about 5 minutes, console)

1. https://console.firebase.google.com → Add project. Analytics can stay off. Note the **Project ID**.
2. Build → Authentication → Get started. Sign-in method tab: enable **Google**, and **Email/Password** with the
   **Email link (passwordless sign-in)** switch on.
3. Authentication → Settings → Authorized domains: `localhost` is there by default. Add your real domain later.
4. Project settings (gear) → General → Your apps → Add app → **Web** (`</>`). Register it. Copy `apiKey`, `appId`
   and `authDomain` from the config snippet. One web app serves all seven frontends.

No service account key, no billing and no Firestore are needed. Do not paste service account JSON anywhere here.

## 2. Point the apps and services at it

```bash
FIREBASE_PROJECT_ID=your-project-id \
FIREBASE_API_KEY=AIza... \
FIREBASE_APP_ID=1:1234567890:web:abcdef \
dev/use-firebase.sh                       # rewrites ui-common/apps/*/.env.local

dev/down.sh
REAL_FIREBASE=1 FIREBASE_PROJECT_ID=your-project-id \
BOOTSTRAP_ADMIN_EMAILS=you@gmail.com dev/up.sh   # no dev IdP; services verify against Google
```

`BOOTSTRAP_ADMIN_EMAILS` is the Google account that becomes ADMIN on first sign-in (its email must be verified).
Restart the `pnpm ... dev` servers after changing `.env.local`. To go back: `dev/use-firebase.sh --dev-idp` and a plain
`dev/up.sh`.

## 3. Check it

- Open http://localhost:5181, Continue with Google, pick your account. The header should show your email and the
  Admin link should work (roles come from Postgres via the auth service).
- A 401 from a service with a valid sign-in almost always means `FIREBASE_PROJECT_ID` differs between the apps'
  `.env.local` and the services. `dev/.state/logs/<service>.log` shows the rejection reason.
- Email-link sign-in: the link opens the same app origin you started from (localhost is an authorized domain). Open it
  in the same browser so the remembered email is found; otherwise the app asks for the address.

## Known gaps

Never exercised here: Google popup sign-in, email-link delivery, token refresh over a long session, and the
`email_verified` bootstrap-admin rule with a real Google account. Do this check before showing the project to anyone.
