# digital-legacy (port 8087, Postgres schema `legacy`)

A dead-man's switch done properly. A person stores instructions, account locations and secrets for the people they
would leave behind. If they stop checking in, trusted people are notified, and the contents are released **only when a
quorum of trustees approves AND the owner has not come back**. **The server can never read the secrets.**

## Architecture

```
 Owner device (client)                          digital-legacy server                     Trustee device (client)
 ─────────────────────                          ─────────────────────                     ───────────────────────
 random vault key K
 AES-256-GCM(K, secrets) ── ciphertext+meta ─▶  vaults (opaque blob)
 Shamir split K  t-of-n
 seal share_i to trustee_i pubkey ─ envelope ─▶ trustees.sealed_share (opaque JSON)
                                                      │
                          owner check-in ───▶ SwitchMachine (pure) ◀── scheduler (FOR UPDATE SKIP LOCKED)
                                                      │  ACTIVE→GRACE→ESCALATING→RELEASE_PENDING→RELEASED
                                                      ├─▶ transactional outbox ─▶ NotificationDispatcher ─▶ NotificationChannel(s)
                                                      └─▶ audit_log (append-only, hash chained, trigger-enforced)
                                                                                           ◀── approve / decline (RELEASE_PENDING)
                                                      RELEASED ──▶ sealed share + ciphertext ─▶ open share with own private key
                                                                                                combine t shares ─▶ K ─▶ decrypt
```

Package map (`com.personalplatform.legacy`): `crypto` (GF(256) + Shamir), `protocol` (pure state machine, policy,
pause ledger), `scheduler` (engine + `@Scheduled` driver), `notify` (outbox, dispatcher, `NotificationChannel`),
`vault` / `trustee` (use cases, jOOQ repositories, envelope validation), `audit`, `web` (controllers, DTOs, ProblemDetail
errors), `config` (properties, the two security chains, tokens).

## The heavy-tech pieces and why they are justified

1. **End-to-end encryption + Shamir.** The whole point of the product is that the operator (and anyone who breaches
   it) cannot read what people leave behind, so key custody cannot sit on the server. The vault key is split among
   trustees; the server stores each share only sealed to the trustee's public key. `crypto.Shamir` is ~150 lines over
   a GF(256) table implementation (AES polynomial), with a seeded-`SecureRandom` injection point, share-set ids so
   mismatched sets are rejected instead of silently decoding to garbage, and a consistency check when more than `t`
   shares are supplied. It is exhaustively tested (every t-subset for many (n,t), a bijection argument for "t-1 shares
   reveal nothing", a chi-square uniformity check, duplicate/mismatched/malformed/tampered rejection).
2. **Durable-timer state machine.** A missed check-in must lead to the same outcome whether the process restarted,
   two instances are running, or the scheduler was late. All timing is a pure function (`SwitchMachine`), the next due
   instant is persisted (`vaults.next_action_at`), instances claim rows with `FOR UPDATE SKIP LOCKED`, escalation steps are
   recorded under a primary key `(vault, incident, step)`, and notifications go through a transactional outbox so a crash
   can neither lose nor (when concurrent) duplicate a ping.
3. **Tamper-evident audit.** Release decisions are exactly what people will later dispute. The audit table is
   append-only by trigger (UPDATE/DELETE/TRUNCATE raise), and every row carries `SHA-256(prev_hash | fields)` computed
   by a trigger (clients cannot supply their own), so even a database admin who disables the trigger leaves a chain that
   `verify_audit_chain()` / `GET /vault/audit/verify` reports as broken.

## Cryptographic envelopes (what clients must produce)

All binary values are standard Base64 with padding. The server validates **format and size only**; it cannot and does
not check that ciphertext decrypts or that a share is a valid Shamir share.

**Vault** (`POST/PUT /v1/legacy/vault`): `ciphertext` = AES-256-GCM output `ciphertext||16-byte tag`
(1..`LEGACY_MAX_CIPHERTEXT_BYTES`, default 1 MiB). `metadata`, no unknown keys, max 4 KiB:

```json
{ "v": 1, "alg": "AES-256-GCM", "nonce": "<12 bytes>",
  "kdf": { "name": "argon2id", "salt": "<16-64 bytes>", "memoryKiB": 65536, "iterations": 3, "parallelism": 4 } }
```
`kdf` is optional (present if the owner's client also wraps/derives keys from a passphrase) and is checked only for
sane parameter bounds (`argon2id` or `pbkdf2-sha256`). Reference AAD used by the test client: `digital-legacy/vault/v1`.

**Trustee public key** (`POST /v1/legacy/trustee/accept`): `keyAlgorithm` `X25519` (44-byte X.509 SPKI) or
`RSA-OAEP` (2048..4096-bit RSA X.509 SPKI), `publicKey` = Base64 of the DER SPKI. The server returns/stores its SHA-256
`keyFingerprint`; owner and trustee should compare fingerprints out of band (see limitations).

**Sealed share** (`PUT /vault/trustees/{id}/share`, body `{ "sealedShare": {...}, "vaultVersion": n }`). The plaintext
inside is `Shamir.Share.encode()` = `[1][t][setId(4)][x][y...]`. Envelope for an X25519 trustee:

```json
{ "v": 1, "alg": "X25519-HKDF-SHA256-AES256GCM", "epk": "<32-byte raw ephemeral public key>",
  "nonce": "<12 bytes>", "ct": "<AES-GCM ciphertext||tag>" }
```
key = HKDF-SHA256(ikm = X25519(eph_priv, trustee_pub), salt = epk||trustee_pub_raw, info = `digital-legacy/share/v1`, 32 bytes).
For an RSA trustee: `{ "v":1, "alg":"RSA-OAEP-SHA256-AES256GCM", "ek":"<RSA-OAEP(SHA-256, MGF1-SHA-256) of a random 32-byte CEK>", "nonce", "ct" }`.
Both bind the share to its place with AAD `digital-legacy/share/v1|<vaultId>|<trusteeId>|<vaultVersion>`, so a share
cannot be replayed to another trustee, vault or key version. A reference client (`ClientCrypto`, plus
`Shamir`) lives in the test tree (`src/test/.../support/ClientCrypto.java`) and drives the end-to-end test.

## Protocol

```
ACTIVE ──(next_due_at)──▶ GRACE ──(grace)──▶ ESCALATING ──(escalation duration)──▶ RELEASE_PENDING ──▶ RELEASED
   ▲  owner check-in from ANY non-terminal state returns here, clears pause, step counter and approvals  │
```
* **ESCALATING** runs the owner's schedule: each step has an offset from entry, an increasing urgency
  (`NOTICE<WARNING<URGENT<FINAL`), an audience (`OWNER|TRUSTEES|ALL`) and an ordered channel preference.
* **RELEASE_PENDING**: trustees are asked to approve or decline. When approvals reach the quorum `t`, the cool-off
  window starts; the vault is released only when `quorum held` AND `cool-off elapsed` AND no check-in arrived. Losing
  the quorum (a trustee changes their vote or is revoked) restarts the cool-off from the next time it is reached. One
  trustee can never release alone unless the owner chose `quorum = 1`, and even then the timers must have run.
* **Incidents**: each ACTIVE→GRACE bumps `epoch`. Approvals and escalation steps are keyed by epoch, so a check-in
  makes every earlier approval irrelevant for good.
* **Outage guard**: if the scheduler is later than `legacy.late-tolerance` (1h) for a transition, the new state is anchored
  at *now* instead of the nominal time (late escalation steps slip the rest of the schedule), so a server outage cannot
  eat the owner's grace.
* **Race with the scheduler**: `RELEASED` exists only once a scheduler transaction commits. A check-in that takes the
  vault row lock first always wins; it deliberately does not pre-advance overdue timers.
* **Pause** (vacation): only while ACTIVE, armed and not overdue; length ≤ min(owner policy `maxPauseSeconds`, platform
  max 60d); total ≤ 120 days per rolling 365; a check-in or `resume` ends it and refunds the unused part.
* **Delivery**: outbox rows are claimed with `SKIP LOCKED`; contacts are tried in the step's channel-preference order
  (fallbacks), retried with exponential backoff, then `FAILED` + audited. Messages are fixed templates with no vault
  content. Protocol progress never depends on delivery success.

## Endpoints

Owner (Firebase ID token, `Authorization: Bearer ...`); every query is scoped to the caller's uid, one vault per owner:

| | |
|--|--|
| `POST /v1/legacy/vault` / `PUT` / `GET` | create / update-or-rotate (`keyRotated`: wipes shares, disarms, bumps `vaultVersion`) / summary |
| `GET /v1/legacy/vault/ciphertext` | owner downloads their own ciphertext |
| `PUT /v1/legacy/vault/policy` | interval, grace, escalation schedule+duration, cool-off, quorum, max pause, owner contacts |
| `POST /vault/arm`, `/disarm`, `/checkin`, `/pause {durationSeconds}`, `/resume` | switch control |
| `GET /vault/state`, `/vault/timeline?limit=`, `/vault/audit/verify` | state, audit trail, chain verification |
| `POST /vault/trustees {label}` | invite (returns the single-use token ONCE) |
| `GET /vault/trustees`, `DELETE /vault/trustees/{id}`, `PUT /vault/trustees/{id}/share` | list (with public keys), revoke, upload sealed share |

Trustee (own filter chain, `Authorization: Trustee <access token>`; trustees need no platform account):

| | |
|--|--|
| `POST /v1/legacy/trustee/accept` | invite token + public key + contacts → access token (shown once) |
| `GET /trustee/me` | coarse `phase` (`WAITING`/`VOTING`/`RELEASED`), quorum size, own share digest and vote |
| `POST /trustee/share/confirm {shareDigest}` | acknowledge the share |
| `POST /trustee/approval {decision}` | `APPROVE`/`DECLINE`, only in RELEASE_PENDING, only if holding a current share |
| `GET /trustee/share`, `GET /trustee/ciphertext` | only when RELEASED; each fetch audited |

Errors are RFC 7807 `ProblemDetail` (400 validation with `problems[]`, 404 not found/not yours, 409 wrong state, 401).

## Run locally

```
docker compose up -d postgres            # or any Postgres on :5433 (db/user/password: platform)
FIREBASE_PROJECT_ID=my-project ./mvnw -pl digital-legacy -am spring-boot:run
./mvnw -pl digital-legacy -am verify     # needs Docker (Testcontainers)
```
Config (env): `DB_URL`, `DB_USER`, `DB_PASSWORD`, `FIREBASE_PROJECT_ID`, `LEGACY_SCHEDULER_ENABLED` (default true),
`LEGACY_MAX_CIPHERTEXT_BYTES`; all `legacy.*` properties (limits, intervals, retry backoff, `late-tolerance`) in
`application.properties`. Flyway reads `db/migration/legacy` (tables) and `db/migration/legacy_ext` (plpgsql triggers,
versions ≥ 100) into one history table.

## Threat model

| Adversary | Outcome |
|--|--|
| Database/disk theft, backups, a curious operator, log readers | See ciphertext, sealed shares, metadata, contact addresses, timings. Cannot decrypt: no key or unsealed share is ever stored or logged. Tokens are stored only as SHA-256 digests. |
| Malicious/compromised server **at rest** | Cannot mint plaintext; can withhold or delay release (availability), or release early by editing state. Early release only hands trustees ciphertext + sealed shares; they still need `t` honest trustees to combine. The audit chain exposes state edits made after the fact. |
| Fewer than `t` colluding trustees | Learn nothing about the key (information-theoretic) and cannot release (quorum). |
| A trustee impersonating another | Trustee tokens are per-trustee, 256-bit, digest-stored; shares are sealed to individual keys and AAD-bound to trustee id. |
| Another user / trustee of another vault | Every query is keyed by uid or by the token's own vault; foreign ids answer 404. Trustee and Firebase credentials are accepted by disjoint chains. |
| Network attacker | TLS is assumed to be terminated in front of the service. Nothing sensitive crosses the wire in clear anyway except tokens. |
| Owner coerced or dead-switch abuse (false release) | Needs silence through the interval, grace, the full escalation ladder, `t` approvals AND a cool-off in which one check-in cancels. |

### Honest limitations (read these)

* **A malicious server CAN substitute trustee public keys.** The owner's client seals each share to the key the server
  returns; a hostile server could return its own key. Mitigation implemented: fingerprints are exposed to both sides; they
  MUST be compared out of band (QR/phone). Not enforced by the protocol. Likewise a malicious *active* server serving
  tampered client code defeats any web E2EE.
* **An active server that lies about state** can release early to trustees; it still cannot decrypt. It can also
  suppress release forever (dead-man's switch availability depends on us running).
* **The "approve" decision is a server-side vote, not a cryptographic one.** Release is a policy gate on a server that
  holds sealed material; it is not threshold-cryptographic gating. Cryptographic gating would require trustee-side
  quorum proofs, out of scope.
* **Share receipt confirmation only proves the trustee knows a share digest exists** (the server cannot test their
  private key). Recommended: owners periodically ask a trustee to prove key possession out of band.
* **Shamir is unauthenticated**: with exactly `t` shares a corrupted share yields a wrong key; AES-GCM then fails to
  decrypt. Surplus shares are cross-checked.
* **Table-based GF(256)** is not constant time. The client machine, not the server, runs it.
* **Metadata the server sees**: who the owner is, number/labels of trustees, their contact addresses, timing of
  check-ins and the audit trail. Labels and contacts are personal data (retention/deletion policy not implemented).
* **No account recovery** for a lost vault key or a quorum of lost trustee keys; that is inherent to E2EE.
* **Audit anchoring**: the hash chain makes tampering *detectable* only if someone has remembered a prior head hash;
  `GET /audit/verify` returns `headHash` and `length` to anchor externally (e.g. mailed to the owner) - not automated.
  A superuser can drop/disable triggers; that is detectable (chain), not preventable.
* Channels are **logging stubs**; no real e-mail/SMS/push gateway. No rate limiting on `/trustee/accept` (tokens carry 256 bits
  so guessing is infeasible, but add throttling). No vault erase / account deletion endpoint yet. Single vault per owner.
  Invite tokens are handed to trustees by the owner (the server cannot know their address before they accept).
* Release does not expire: `RELEASE_PENDING` waits indefinitely for quorum (trustees are re-notified only on entry).
* Not verified: behaviour against real Firebase tokens, real notification gateways, multi-node production load.

## Next steps

Real gateways behind `NotificationChannel`; trustee reminder cadence in RELEASE_PENDING; owner-initiated vault erasure;
signed audit head anchoring; WebAuthn-bound trustee access; key-possession challenge for trustees before arming;
published JS/Kotlin client library implementing the envelopes above.
