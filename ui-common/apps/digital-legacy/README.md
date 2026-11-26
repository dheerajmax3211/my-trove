# @platform/digital-legacy

A dead-man's switch for the things you leave behind. The owner writes secrets and instructions; if they stop
checking in, trusted people (trustees) are told and, only after a quorum approves **and** a cool-off passes, can
retrieve their piece of the key and decrypt. **All cryptography happens in the browser: the server never sees a
secret, a key, or a plaintext share.**

Frontend for the `digital-legacy` service (port 8087): the owner's workspace module (`/app/digital-legacy`) and the
public trustee portal the workspace serves at `/trustee`.

## Run it

This package has no app or dev server of its own: the workspace mounts it at `/app/digital-legacy`.

```
dev/web.sh workspace     # http://localhost:5190/app/digital-legacy; add ?demo=1 for the in-memory mock (no backend)
```

Live mode needs the dev stack (`dev/up.sh`, gateway on :8080): the workspace's API client calls
`<gateway>/api/digital-legacy/v1/...`. Sign-in and `VITE_*` configuration belong to the workspace (`apps/workspace`).
Trustees use http://localhost:5190/trustee (no account). In the workspace's demo mode (`?demo=1`) the owner pages
and the trustee portal share one in-memory server, so one tab can play both roles: Vault (write, encrypt, download
key file) -> Check-in policy (save) -> Trustees (invite, open the invite link, register, compare fingerprints, set
quorum, seal shares) -> Overview (arm). The demo has no clock control any more (the standalone app's "Demo clock"
was retired with it), so the release path is exercised by the tests, which advance the mock's clock.
Checks, from `ui-common`: `pnpm lint && pnpm typecheck && pnpm test`; the module is bundled by
`pnpm --filter @platform/workspace build`.

## In the workspace

`src/module.tsx` exports `productModule` (`@platform/digital-legacy/module`), which the workspace mounts at
`/app/digital-legacy/*`. It covers the **owner's pages only** (overview, vault, trustees, check-in policy,
timeline). The trustee portal authenticates with trustee tokens rather than the owner's session, so it is a separate
export, `@platform/digital-legacy/trustee` (`TrusteePortal`, props `apiBaseUrl`, `fetch`, `now`), which the
workspace mounts at `/trustee/*` outside its sign-in gate. The module supplies:

- `Providers`: the in-memory vault key session. Leaving the module or signing out unmounts it, which zero-fills the
  key. The key and plaintext are never written to storage, cookies or logs.
- `Routes` and `nav`: the owner pages, with module-relative paths (`ModuleLink`, `useModulePath`).
- `useTodayItems`: check-in due within 7 days (`warn`, `danger` when overdue or past grace), a released vault
  (`danger`), a vacation pause or a healthy armed switch (`info`), and trustee invitations nobody has answered.
- `createDemoFetch`: a fresh in-memory mock server per call, reachable at the gateway path.

Invite links point at `<origin>/trustee/accept#invite=...`. The origin is `VITE_TRUSTEE_PORTAL_URL` when set, else the
page's own origin, which is the workspace (the service's `LEGACY_TRUSTEE_PORTAL_URL` also defaults to the workspace).

## Screen map

Owner pages are relative to `/app/digital-legacy`; the trustee portal paths are absolute in the workspace.

```
/                    Overview: the switch (state, next deadline, "I'm here"), state ladder, trustee circle, arm/disarm, vacation pause; first-run guide when there is no vault
/vault               Vault editor (encrypts locally), unlock with key file, rotate key, what the server holds
/trustees            Invite (link shown once), fingerprint compare, t-of-n quorum, seal shares
/policy              Check-in policy: interval, grace, reminder schedule, cool-off, contacts, live timeline preview
/timeline            Audit trail + hash-chain verification
/trustee             Trustee portal entry: invite code or access token (no Firebase)
/trustee/accept      Accept invite: contacts -> generate key in browser -> save key file -> register public key
/trustee/portal      Coarse phase, confirm share receipt, approve/decline (VOTING), open own share (RELEASED)
/trustee/combine     Paste t shares -> rebuild key -> decrypt and show the vault
```

Two route groups, two authentication schemes, two API client instances and two query caches: the owner module
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
- UI end to end per feature (`features/*/*.test.tsx`, through `testing/render.tsx`, which renders the owner module or
  the trustee portal the way the workspace does): overview states and countdown, check-in, arm/disarm, pause; vault
  create/unlock/wrong passphrase/storage check; trustees invite/fingerprint/seal/swapped-key refusal/quorum/revoke; policy
  form + preview + validation; timeline + chain verify/tamper; trustee accept (key generated in browser), vote,
  unseal, combine, wrong key file, mismatched shares.
- API layer: request shapes, Bearer vs Trustee headers, error mapping.

## Honest limitations of this app

- The unit tests do not run a real browser (layout, dark mode and 375px behaviour use token variables and the
  AppShell drawer); the workspace's `dev/qa/` scripts cover the module and the trustee portal in one.
- The mock mirrors the Java code as read; subtle differences (e.g. Java's lenient Base64 padding, exact validation
  messages for bean-validation failures) may exist.
- X25519 in WebCrypto needs a recent browser (Chrome 133+, Safari 17+, Firefox 130+); older ones fall back to
  RSA-OAEP-3072 (slower, larger envelopes, still accepted by the server).
- The combine screen needs one trustee to be signed in (to download the ciphertext); there is no "paste ciphertext"
  offline mode yet.
- Policy limits are mirrored client-side from the service defaults; if an operator changes them, the server's 400/409
  message is shown instead.
- Single vault per owner (service limit). Vault content is title/body text only (no file attachments; 1 MiB cap).
- The workspace's SPA hosting must serve `index.html` for `/trustee/*` as for every other route (the nginx image's
  SPA fallback does; not re-checked in a deployed image as part of this change).
