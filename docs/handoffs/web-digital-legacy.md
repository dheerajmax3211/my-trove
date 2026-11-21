# Handoff: digital-legacy

## Candidates to promote to `packages/ui`

- `components/Callout.tsx` (info/warning/danger/success note box with icon; used ~30 places). Tokens only.
- `components/Countdown.tsx` + `lib/clock.tsx` (injectable clock, `useNow`): useful for any deadline UI; the injectable
  clock is what makes countdowns testable and demo-time-travel possible.
- `components/CopyButton.tsx`, `components/KeyFilePicker.tsx` (file-or-paste input), `components/Fingerprint.tsx`.
- `features/policy/TimelinePreviewView` (proportional phase bar) is product specific; leave it.
- `PageSkeleton` (title + two blocks) duplicates what other apps do ad hoc.

## Dependencies

None added. Only workspace packages plus the exact pins already used (`@tanstack/react-query` 5.108.0, react 19.3.1,
react-router-dom 7.18.6). `check-versions` passes. Crypto is WebCrypto only: no libsodium/noble. (Reviewers may prefer
a vetted library for X25519/HKDF; WebCrypto was chosen to avoid a dependency and because Node/browsers both ship it.)

## Assumptions worth checking against the service

- `Instant`s serialise as ISO strings; timeline is newest-first; `actorKind` is `OWNER|TRUSTEE|SYSTEM`.
- Bean-validation failures (blank label, missing fields) return Spring's generic 400 with no field list; the UI validates
  client-side so these should not occur.
- The initial `vaultVersion` is 1; `keyRotated` bumps it, wipes shares and disarms (README of the service says so).
- `/api` is stripped by the dev proxy (`rewrite`); production hosting must do the same or set `VITE_API_BASE_URL`.
- The dev server needs `strictPort` 5186; CORS is not needed through the proxy. Real deployments need CORS or a same-origin
  reverse proxy for both `/v1/legacy/vault/**` and `/v1/legacy/trustee/**`.

## Security review asks

1. Review `src/crypto/*` (small: roughly 1,000 lines excluding tests) and the Java cross-checks in `crypto/*.test.ts`.
2. Consider SRI / signed bundles and a strict CSP (`default-src 'self'`; no inline script except the theme bootstrap) for
   production: a tampered bundle defeats the whole design.
3. Server-side nicety: serve `keyFingerprint` for the _owner's_ view only after the trustee confirms it (key possession
   challenge, as the service README suggests), and rate-limit `/trustee/accept`.
4. Follow-ups noted in README: offline "paste ciphertext" combine mode; WebAuthn-bound trustee access; share test-drive.

## Process note

My working copy was removed by the environment mid-task and rebuilt from the real `ui-common` plus the saved work; the
finished app is in the copy path given in the final report. The original `ui-common` was never modified.
