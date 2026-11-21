export interface SecurityControl {
  id: string
  title: string
  /** What it is, in plain words. */
  what: string
  /** What it protects against, and where it stops. */
  detail: string
  /** Names of the tests or modules in the repository that exercise it. */
  proof: readonly string[]
}

/** What is actually built and tested. Nothing on this list is planned. */
export const controls: readonly SecurityControl[] = [
  {
    id: 'sign-in',
    title: 'Firebase sign-in',
    what: 'You sign in with Google or an email link. Every service checks the signature, issuer, audience and expiry of the token it is given.',
    detail:
      'Passwords never reach My-Trove. In local development a small stand-in identity provider replaces Firebase, and it is bound to the local machine.',
    proof: ['libs/platform-security', 'dev/dev-idp.mjs'],
  },
  {
    id: 'permissions',
    title: 'Roles and permission checks',
    what: 'Five personas hold named permissions, and everything not granted is denied. An Admin cannot grant Admin or Owner, or touch either. The last Owner cannot be removed. Every role change is written to an audit table.',
    detail:
      'Services enforce permissions themselves, so hiding a link in the interface is only a convenience. A permission matrix test runs each persona against each admin endpoint.',
    proof: ['AdminApiTest', 'auth'],
  },
  {
    id: 'tokens',
    title: 'Signed, short-lived platform tokens',
    what: 'The gateway turns your sign-in into a platform token signed with RS256 and valid for ten minutes. It carries your roles, permissions and plan. Services verify it against a public key set.',
    detail:
      'The gateway caches each exchange for 60 seconds, so a role change or suspension takes effect within about a minute.',
    proof: ['gateway', 'auth', 'dev/e2e-phase1.sh'],
  },
  {
    id: 'audit',
    title: 'Hash-chained audit logs',
    what: 'In Consent and Digital Legacy every entry stores the hash of the one before it, and the database refuses updates and deletes. You can ask the service to walk the chain and name the first broken link.',
    detail:
      'This makes silent edits detectable. It does not make them impossible: a database owner can disable the guard.',
    proof: ['AuditChainTest', 'consent-gateway', 'digital-legacy'],
  },
  {
    id: 'legacy',
    title: 'An end-to-end encrypted legacy vault',
    what: 'Digital Legacy encrypts in the browser, splits the key with Shamir’s scheme and seals each share to one trustee. The server stores only ciphertext and sealed shares.',
    detail:
      'A breach of the server alone reveals no secrets. Fewer than the quorum of trustees learn nothing about the key.',
    proof: ['digital-legacy', 'ShamirTest'],
  },
  {
    id: 'rls',
    title: 'Row-level security for search',
    what: 'Ask Your Life asks Postgres to filter every query by the signed-in owner. If the owner is not set, the query returns nothing.',
    detail:
      'A forgotten filter in a future query leaks nothing. It does not protect against someone with database access.',
    proof: ['RlsIsolationTest', 'ask-your-life'],
  },
  {
    id: 'limits',
    title: 'Rate limits and quotas',
    what: 'The gateway limits each caller by plan, per minute and per month, and answers 429 with a Retry-After header and a problem body.',
    detail:
      'Limits are kept in memory in one gateway process, which is right for one instance and not for several.',
    proof: ['gateway', 'dev/e2e-phase1.sh'],
  },
  {
    id: 'secrets',
    title: 'Secrets handled carefully',
    what: 'App secrets and device tokens are stored only as hashes and shown once. Consent signing keys are encrypted at rest with AES-256-GCM. Tests check that secrets and keys never appear in logs.',
    detail:
      'The key-encryption key comes from an environment variable. There is no key management service.',
    proof: ['SecretHandlingTest', 'consent-gateway'],
  },
  {
    id: 'ledger',
    title: 'A ledger the database keeps honest',
    what: 'Family Treasury rejects, at commit, any entry that does not balance, and refuses edits and deletes of postings.',
    detail: 'A reconciliation job compares balances with the ledger and reports drift.',
    proof: ['family-treasury', 'TreasurySchemaTest'],
  },
]

/** The limits of the project, stated as plainly as the controls. */
export const limits: readonly { title: string; text: string }[] = [
  {
    title: 'It is a portfolio project',
    text: 'One developer built it in the open. It has not run in production and has no operations team.',
  },
  {
    title: 'No third-party audit',
    text: 'Nobody outside the project has reviewed the code or penetration-tested it. The tests are the project’s own.',
  },
  {
    title: 'No real payments',
    text: 'Billing is simulated. Plans are request limits, nobody is charged, and Family Treasury moves no money.',
  },
  {
    title: 'Notifications are log-only',
    text: 'Nothing is emailed, texted or pushed. Reminders, follow-ups and trustee notices are written to a log.',
  },
  {
    title: 'Some data is plaintext at rest',
    text: 'Only the legacy vault is end-to-end encrypted. Consent values and the text Ask Your Life searches sit in the database unencrypted.',
  },
  {
    title: 'Trustee keys need checking by hand',
    text: 'A malicious Digital Legacy server could substitute a trustee’s public key. Owner and trustee must compare fingerprints out of band.',
  },
]
