# @platform/digital-legacy

A dead-man's switch for the things you leave behind. The owner writes secrets and instructions; if they stop
checking in, trusted people (trustees) are told and, only after a quorum approves **and** a cool-off passes, can
retrieve their piece of the key and decrypt. **All cryptography happens in the browser: the server never sees a
secret, a key, or a plaintext share.**

Frontend for the `digital-legacy` service (port 8087). Dev port **5186**.

## Run it

```
pnpm --filter @platform/digital-legacy dev          # demo mode, no setup: http://localhost:5186
pnpm --filter @platform/digital-legacy typecheck
pnpm --filter @platform/digital-legacy build
pnpm test                                           # monorepo-wide vitest (this app: apps/digital-legacy/src/**)
```

**Demo mode** is the default when no `VITE_FIREBASE_*` is set (or when `VITE_USE_MOCK=true`): a stub sign-in and
an in-memory mock of the service that reimplements its rules (see "Mocked vs real"). The owner app and the
trustee portal share that one in-memory server, so you can play both roles in one tab. The sidebar has a
**Demo clock** (+1, +7, +30 days) to simulate silence and watch GRACE, ESCALATING, RELEASE_PENDING, RELEASED.
Suggested tour: Vault (write, encrypt, download key file) -> Check-in policy (save) -> Trustees (invite three,
open each invite link in a private window or `/trustee`, register, compare fingerprints, set quorum, seal
shares) -> Overview (arm) -> +30 days -> `/trustee` as two trustees (approve) -> +7 days -> open shares ->
Combine shares.

**Real mode**: start the service (`./mvnw -pl digital-legacy -am spring-boot:run`, needs Postgres), copy
`.env.example` to `.env.local`, set the Firebase web config (or the Auth emulator host). The Vite dev server
proxies `/api/*` to `http://localhost:8087` and strips the `/api` prefix.

| Env var                                               | Meaning                                               |
| ----------------------------------------------------- | ----------------------------------------------------- |
| `VITE_FIREBASE_*`, `VITE_FIREBASE_AUTH_EMULATOR_HOST` | Firebase web config / emulator for owner sign-in      |
| `VITE_API_BASE_URL`                                   | API base (default `/api`)                             |
| `VITE_USE_MOCK=true`                                  | force the in-memory API even with Firebase configured |

## Screen map

```
/                    Overview: status panel + live countdown, "I'm here" check-in, vacation pause, arm/disarm
/vault               Vault editor (encrypts locally), unlock with key file, rotate key, what the server holds
/trustees            Invite (link shown once), fingerprint compare, t-of-n quorum, seal shares
/policy              Check-in policy: interval, grace, reminder schedule, cool-off, contacts, live timeline preview
/timeline            Audit trail + hash-chain verification
/trustee             Trustee portal entry: invite code or access token (no Firebase)
/trustee/accept      Accept invite: contacts -> generate key in browser -> save key file -> register public key
/trustee/portal      Coarse phase, confirm share receipt, approve/decline (VOTING), open own share (RELEASED)
/trustee/combine     Paste t shares -> rebuild key -> decrypt and show the vault
```

Two route groups, two authentication schemes, two API client instances and two query caches: the owner app
uses `Authorization: Bearer <Firebase ID token>`; `/trustee/*` uses `Authorization: Trustee <token>` through its
own `createTrusteeClient` (no ID-token source at all) and never touches Firebase.

## What is encrypted where

| Thing                                        | Where it is made                                                                        | What leaves the browser                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Vault plaintext (title/body entries as JSON) | owner's browser                                                                         | nothing                                               |
| Vault key (random 32 bytes)                  | owner's browser, in memory only                                                         | nothing                                               |
| Vault ciphertext                             | AES-256-GCM, AAD `digital-legacy/vault/v1`, random 12-byte nonce                        | `ciphertext` (Base64, data+tag) and `{v, alg, nonce}` |
| Key backup                                   | vault key wrapped with PBKDF2-SHA256 (600k) + AES-GCM under the owner's passphrase      | a file the owner downloads; never uploaded            |
| Shamir shares                                | owner's browser: GF(256) split of the vault key, `[1][t][setId(4)][x][y...]`            | only sealed (below)                                   |
| Sealed share                                 | per trustee: X25519+HKDF-SHA256+AES-GCM, or RSA-OAEP-SHA256+AES-GCM; AAD binds `vaultId | trusteeId                                             | vaultVersion` | `{v, alg, epk\|ek, nonce, ct}` |
| Trustee key pair                             | trustee's browser (X25519; RSA-OAEP-3072 fallback)                                      | public key (SPKI) only                                |
| Trustee key file                             | trustee's browser, optionally passphrase-wrapped                                        | a file the trustee downloads                          |

`src/crypto/` is plain TypeScript over WebCrypto. Shamir and GF(256) are line-for-line ports of the server's
`Shamir.java` / `Gf256.java`; the envelope formats are those of its reference client `ClientCrypto.java`.

### Verified against the Java code

Vectors were generated by compiling the service's own `Gf256`, `Shamir` and test-side `ClientCrypto` and running
them (`src/crypto/__fixtures__/javaVectors.json`). Tests prove:

- the full 256x256 GF multiplication table (SHA-256) and all 255 inverses equal Java's;
- replaying Java's exact random stream through the TS `split` yields byte-identical shares, consuming the same
  number of random bytes, for 3-of-... through 128-of-255 splits;
- TS opens X25519 and RSA envelopes and a vault ciphertext **sealed by Java**, and computes Java's fingerprints;
- (checked once by hand, outside the repo) Java opened TS-sealed X25519 and RSA envelopes, decrypted a TS-made
  vault and decoded a TS-made share.

## Threat model

Adversary -> what they get:

| Adversary                                          | Outcome                                                                                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Reads the database, backups, logs, network traffic | Ciphertext, sealed shares, public keys, metadata, contact addresses, timings. No key or plaintext exists server-side.                        |
| Fewer than `t` colluding trustees                  | Learn nothing about the key (information-theoretic) and cannot release (server quorum).                                                      |
| A trustee impersonating another                    | Shares are sealed to individual keys and AAD-bound to trustee id; tokens are per trustee.                                                    |
| Another user                                       | Server scopes everything to the caller; the two auth chains are disjoint.                                                                    |
| Someone who steals the owner's key file            | Needs the passphrase (PBKDF2-600k; strength is the passphrase's).                                                                            |
| Someone who steals a trustee's key file            | If the trustee set no passphrase, they hold that trustee's key; they still need the sealed share (only served after release) and `t-1` more. |

### Limitations (read these)

1. **A malicious server can swap a trustee's public key.** The owner seals each share to the key the server
   returns. If the server returns its own key, it can later open that share. This is why every key has a
   fingerprint (SHA-256 of the SPKI, shown to both sides) that the owner and trustee **must compare out of band**
   (phone, in person). The app enforces the _procedure_, not the truth: sealing is blocked until each fingerprint
   is marked "verified" (stored locally as public values), and the client refuses a key whose bytes do not hash to
   the fingerprint the server reported for it. It cannot know whether you really compared. If the server swaps
   keys for `t` trustees _and_ you skip the comparison, it can read the vault after release.
2. **A malicious or compromised server can also serve tampered JavaScript**, which defeats any web E2EE. Mitigations
   (not implemented): subresource integrity, signed/pinned bundles, a native or browser-extension client.
3. **Approval is a server-side vote, not cryptographic.** A hostile server can release early (hands trustees ciphertext
   plus sealed shares). It still needs `t` honest trustees to open them. It can also withhold release forever.
4. **Share receipt confirmation does not prove a trustee's key works**; ask trustees to test their key file out of band.
5. **Shamir is unauthenticated.** With exactly `t` shares a wrong/corrupted share yields a wrong key; the vault's AES-GCM
   then fails and the UI says the shares combine but do not open the vault. Surplus shares are cross-checked.
6. **Key loss is final.** Lose the owner's key file or passphrase: the owner cannot edit again (trustees can still open
   after a release). Lose more than `n - t` trustee key files: the vault can never be opened. No recovery exists.
7. **Re-sealing is all-or-nothing.** A new split replaces every older one, so all trustees are re-sealed together; if some
   uploads fail, trustees hold mixed splits until you retry (the UI says so). Adding/revoking a trustee or changing the
   quorum means sealing again. Rotating the key wipes all shares and disarms (server behaviour).
8. **Memory-only keys are best-effort.** Keys live in JS memory and are zero-filled on lock/sign-out, but the GC, browser
   extensions, devtools and swap are outside the app's control. GF(256) table lookups are not constant time. PBKDF2 (not
   Argon2) is used because WebCrypto has no memory-hard KDF.
9. **Metadata is visible to the server**: who the owner is, number/labels of trustees, contact addresses, check-in timing,
   audit trail, ciphertext size.
10. **What is in browser storage**: only the trustee access token (`dl.trustee.session`, so the portal survives a reload;
    "Forget this device" removes it), the owner's list of fingerprints they marked verified (public values), and the
    theme. Never plaintext, vault keys, private keys, shares or passphrases. The invite token travels in the URL
    _fragment_ (never sent to a server) and is removed from the address bar after it is read.
11. The tamper-evident audit trail only detects edits if you remember an earlier head hash; the Timeline page offers to
    copy it so you can keep it elsewhere.

## Mocked vs real

`src/mock/backend.ts` is a faithful re-implementation of the service contract used in demo mode and every test: same
paths, status codes and problem+json shapes; envelope/policy validation and limits; state machine incl. quorum, cool-off,
outage guard and rolling pause budget; invite expiry; disjoint Bearer/Trustee auth; hash-chained audit. It is derived
from reading the Java services, **not** run against them. Not mocked: real notification delivery (the service's channels
are logging stubs anyway), Firebase token verification, durability. The mock records every request so tests can assert
no plaintext/key appears in any body.

## Tests

Vitest + Testing Library, all deterministic (no sleeps; the mock clock is advanced explicitly, in 10-minute scheduler
ticks). Real WebCrypto (Node 24) is used everywhere. Coverage:

- `crypto/`: GF(256), Shamir (every t-subset for many (n,t), t-1 reveals nothing, duplicate/mismatched/inconsistent/
  malformed shares, text form), Java vectors and interop, envelopes (both algorithms, AAD replay, tamper, wrong key),
  key files, fingerprints.
- `flows.test.ts`: encrypt -> seal to 3 trustees (2 X25519, 1 RSA) -> register -> silence -> approve x2 -> release -> unseal
  -> combine -> plaintext equals the original; one share cannot decrypt; owner check-in resets from every state;
  request-body scan for plaintext/keys/shares/private keys; wrong key files; pause limits.
- `mock/backend.test.ts`: the backend rules the UI relies on.
- UI end to end per feature (`features/*/*.test.tsx`): overview states and countdown, check-in, arm/disarm, pause; vault
  create/unlock/wrong passphrase/storage check; trustees invite/fingerprint/seal/swapped-key refusal/quorum/revoke; policy
  form + preview + validation; timeline + chain verify/tamper; trustee accept (key generated in browser), vote,
  unseal, combine, wrong key file, mismatched shares.
- API layer: request shapes, Bearer vs Trustee headers, error mapping.

## Honest limitations of this app

- Not exercised against the real service, a real Firebase project, or in a real browser (layout, dark mode and 375px
  behaviour were built with token variables and the AppShell drawer but not visually checked by me).
- The mock mirrors the Java code as read; subtle differences (e.g. Java's lenient Base64 padding, exact validation
  messages for bean-validation failures) may exist.
- X25519 in WebCrypto needs a recent browser (Chrome 133+, Safari 17+, Firefox 130+); older ones fall back to
  RSA-OAEP-3072 (slower, larger envelopes, still accepted by the server).
- The combine screen needs one trustee to be signed in (to download the ciphertext); there is no "paste ciphertext"
  offline mode yet.
- Policy limits are mirrored client-side from the service defaults; if an operator changes them, the server's 400/409
  message is shown instead.
- Single vault per owner (service limit). Vault content is title/body text only (no file attachments; 1 MiB cap).
- The production bundle is ~660 kB (Firebase); no code splitting yet. SPA hosting needs an index.html fallback for
  `/trustee/*` and the owner routes.
