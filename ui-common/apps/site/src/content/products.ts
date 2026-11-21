import type { ProductMarkId } from '@platform/ui'

/** The six first-party products. Order is the order they appear everywhere on the site. */
export type ProductId = Exclude<ProductMarkId, 'core' | 'admin'>

export const productIds = [
  'waiting-on',
  'consent',
  'home-pulse',
  'ask-your-life',
  'digital-legacy',
  'family-treasury',
] as const satisfies readonly ProductId[]

export interface Capability {
  title: string
  text: string
}

export interface TechPiece {
  /** What it is called (a technology or a technique). */
  name: string
  /** What it is, in plain words. */
  what: string
  /** Why the product needs it. */
  why: string
}

export interface ProductContent {
  id: ProductId
  name: string
  /** A few words, used in menus and cards. */
  tagline: string
  /** One sentence for the home page list. */
  summary: string
  /** The hard engineering problem behind it, in a few words. */
  hardPart: string
  /** The page h1. */
  headline: string
  /** The standfirst under the h1. */
  lead: string
  metaDescription: string
  does: readonly Capability[]
  steps: readonly Capability[]
  tech: readonly TechPiece[]
  /** Honest gaps. Every item is a thing a reader might assume the product does. */
  notYet: readonly string[]
}

export const products: readonly ProductContent[] = [
  {
    id: 'waiting-on',
    name: 'Waiting On',
    tagline: 'Chases what you are owed',
    summary:
      'Tracks refunds, claims and approvals you are waiting on, runs the follow-up schedule and drafts the letters.',
    hardPart: 'Weeks-long schedules that survive restarts',
    headline: 'Know what you are still waiting for, and when to push.',
    lead: 'Refunds, insurance claims, reimbursements, approvals, deliveries. Add each one with the date you expect it, and Waiting On runs a follow-up schedule for it: a nudge, an escalation letter, an optional final notice and an expiry date. Nothing quietly goes cold.',
    metaDescription:
      'Waiting On tracks refunds, claims and approvals you are owed, runs a follow-up schedule for each and drafts the letters. A My-Trove product.',
    does: [
      {
        title: 'Tracks anything you are owed',
        text: 'Refund, claim, reimbursement, approval, delivery or something else, with the other side, the amount and the date you expect it.',
      },
      {
        title: 'Runs a follow-up schedule for each item',
        text: 'A nudge, then an escalation letter, an optional final notice, then expiry. The days default from your expected date and the category, and you can change them.',
      },
      {
        title: 'Drafts the letters',
        text: 'Templates by category and tone, previewable any day. They are drafts for you to send, not legal advice.',
      },
      {
        title: 'Reads replies and adjusts',
        text: 'Each item has its own reply address. A reply is sorted into paid, refused, needs info or unknown: paid closes the item, refused escalates now, and needs info pauses chasing for seven days.',
      },
      {
        title: 'Keeps a timeline you can trust',
        text: 'Every step, reply and snooze is recorded in order. The database rejects edits and deletes of that record.',
      },
    ],
    steps: [
      {
        title: 'Add the item',
        text: 'Say what you are waiting for, from whom, and when it should have arrived. You get a reply address for it.',
      },
      {
        title: 'The schedule starts',
        text: 'A timer is set for each step. Resolve or cancel the item and the pending timers are cancelled at once.',
      },
      {
        title: 'A step comes due',
        text: 'The letter is drafted and the step is recorded on the timeline. You read it and send it.',
      },
      {
        title: 'Replies steer it',
        text: 'A reply that says it is paid closes the item. A refusal skips ahead to the escalation. Silence ends in expiry.',
      },
    ],
    tech: [
      {
        name: 'Temporal workflows',
        what: 'Each item is one durable workflow that waits on timers for days to months.',
        why: 'A chase can run for 90 days. It has to survive deploys and crashes without losing or repeating a step, and snoozing or resolving has to move or cancel the timers exactly. Tests run weeks of schedule in milliseconds.',
      },
      {
        name: 'Append-only timeline',
        what: 'The database rejects updates, deletes and truncates on the event table.',
        why: 'When you ask what happened and when, the record cannot have been edited.',
      },
      {
        name: 'Rule-based reply sorting',
        what: 'Ordered, offline rules, with quoted history ignored and the first match winning.',
        why: 'It is predictable and explainable. Anything unclear is logged and does nothing.',
      },
    ],
    notYet: [
      'It does not email anyone. Notification delivery is log-only, so you send the letters yourself.',
      'The letters are templates. They are not legal advice, and your name is left blank for you to fill in.',
      'Replies are trusted by their address. Anyone who learns an item reply address could post a reply to it.',
      'There is no item editing, attachments or recurring items yet.',
    ],
  },
  {
    id: 'consent',
    name: 'Consent',
    tagline: 'Lend your data, on your terms',
    summary:
      'Keep your details in one vault and let apps ask for a narrow, timed, revocable slice, with every read logged.',
    hardPart: 'A token issuer, a policy engine and a hash-chained log',
    headline: 'Lend your details to an app without handing it the vault.',
    lead: 'Store your sizes, allergies, addresses and preferences once. When an app wants some of them, it asks. You approve a narrower slice, for a stated purpose, for a limited time, and you can take it back. The next read after you revoke is refused.',
    metaDescription:
      'Consent keeps your personal details in one vault and lets apps ask for scoped, time-limited, revocable access, with a tamper-evident log of every read. A My-Trove product.',
    does: [
      {
        title: 'Holds your details by path',
        text: 'Attributes live at paths like profile.sizes.shoe. Access is granted to a path and everything beneath it, never to a lookalike such as profile.sizes_secret.',
      },
      {
        title: 'Registers the apps that may ask',
        text: 'Each app gets a client id and a secret. The secret is shown once and stored only as a hash.',
      },
      {
        title: 'Lets you approve less than was asked',
        text: 'Narrow the scopes, shorten the duration, cap the number of reads, set a sensitivity ceiling or restrict the hours. You can only narrow, never widen.',
      },
      {
        title: 'Revokes instantly',
        text: 'Revoking a grant, or disabling an app, ends access on the very next read, even if its token has not expired.',
      },
      {
        title: 'Logs every read, allowed or denied',
        text: 'The log stores keys, decisions and reasons, never the values. You can verify the chain and be told the first broken link.',
      },
    ],
    steps: [
      {
        title: 'An app asks',
        text: 'It names the scopes it wants, why, and for how long.',
      },
      {
        title: 'You decide',
        text: 'Approve as asked, approve a narrower slice, or deny.',
      },
      {
        title: 'The app reads',
        text: 'It swaps the grant for a token that lives a few minutes and reads only what the grant covers.',
      },
      {
        title: 'Every read is checked again',
        text: 'The live grant is re-checked on each read and the result is added to your log in the same transaction.',
      },
    ],
    tech: [
      {
        name: 'A token issuer with rotating keys',
        what: 'RS256 tokens with a public key set (JWKS), so anyone can verify a token offline. Old keys stay published until the tokens they signed have expired.',
        why: 'A shared secret cannot be handed to third parties. Forged and downgraded tokens are rejected in tests.',
      },
      {
        name: 'A pure policy engine',
        what: 'One function decides allow or deny with a machine-readable reason, and it denies unless every check passes.',
        why: 'The security-critical rules fit in one file and are tested row by row.',
      },
      {
        name: 'Hash-chained audit log',
        what: 'Each entry carries the hash of the one before it, and the database refuses updates and deletes.',
        why: 'The product promise is that you can see who read what. Silent edits become detectable.',
      },
    ],
    notYet: [
      'An app belongs to the person who registered it. One app serving many people, and a hosted approval screen with redirects, are not built.',
      'Your stored values sit in the database as plain JSON. Only the signing keys are encrypted at rest.',
      'The log is tamper-evident, not tamper-proof. A database owner can disable the guard, and nothing anchors the chain outside the database yet.',
    ],
  },
  {
    id: 'home-pulse',
    name: 'Home Pulse',
    tagline: 'Hears an appliance failing early',
    summary:
      'Learns each appliance’s normal power draw and flags drift early, tied to its service dates and warranty.',
    hardPart: 'Time-series storage and explainable anomaly detection',
    headline: 'Hear a failing appliance before it fails.',
    lead: 'Smart plugs and ESP32 sensors report how much power an appliance draws. Home Pulse learns what normal looks like for each one, flags drift early (a compressor drawing more current, a fridge that never switches off) and ties every alert to the appliance’s service dates and warranty.',
    metaDescription:
      'Home Pulse learns the normal power draw of each appliance, flags drift early and ties alerts to service dates and warranty. A My-Trove product.',
    does: [
      {
        title: 'Learns a signature per appliance',
        text: 'After a week of data it records how often the appliance runs, how much it draws and how long each run lasts.',
      },
      {
        title: 'Flags five kinds of trouble',
        text: 'Power shift, duty-cycle drift, stuck on, stopped, and no data from the sensor.',
      },
      {
        title: 'Explains each alert with numbers',
        text: 'For example, running power is 11% above its learned normal, 1063 W against 957 W.',
      },
      {
        title: 'Remembers service and warranty',
        text: 'Reminders for service due and warranty ending. An anomaly on a unit still under warranty is raised as a claim opportunity.',
      },
      {
        title: 'Takes readings by HTTP or MQTT',
        text: 'Each sensor gets a token shown once. Retries are safe because a reading is identified by device and time.',
      },
    ],
    steps: [
      {
        title: 'Register the appliance',
        text: 'Name it, say what it is, and add the warranty and service dates.',
      },
      {
        title: 'Connect a sensor',
        text: 'It posts power readings with its own token. Readings older than 30 days, or stamped well into the future, are rejected.',
      },
      {
        title: 'It learns normal',
        text: 'Median-based statistics shrug off door-opens and brown-outs during the learning week.',
      },
      {
        title: 'It watches for drift',
        text: 'Every five minutes it compares the last 48 hours with normal. A deviation has to be sustained across windows before it alerts, and the alert clears after three clean checks.',
      },
    ],
    tech: [
      {
        name: 'TimescaleDB',
        what: 'Readings are stored in daily chunks, compressed after a week, with one-minute and one-hour rollups kept up to date by the database.',
        why: 'One plug at one reading a second is 86,400 rows a day. Charts and the detector read rollups instead of scanning raw rows.',
      },
      {
        name: 'Robust statistics, not a black box',
        what: 'Medians and median absolute deviation over six-hour windows.',
        why: 'When it tells you to call a technician it can say why, in numbers.',
      },
      {
        name: 'Alert lifecycle',
        what: 'One live alert per appliance and kind, with hysteresis so a value hovering at a threshold does not flap.',
        why: 'You get one alert that escalates, not a stream of repeats.',
      },
    ],
    notYet: [
      'No real appliance has been measured. The thresholds were tuned on a simulator. On simulated data a healthy fridge and AC raised no alerts across 60 days and three seeds.',
      'The MQTT adapter has never run against a real broker. It is off by default.',
      'Normal is the first week. If an appliance was already degraded, or the season changes, the baseline is wrong.',
      'Alerts are pull-only. There is no push, email or SMS yet.',
    ],
  },
  {
    id: 'ask-your-life',
    name: 'Ask Your Life',
    tagline: 'One private search box',
    summary:
      'One search across your notes, receipts and documents, matching exact identifiers and near misses, for you alone.',
    hardPart: 'Hybrid search with the database enforcing who sees what',
    headline: 'Search everything you have written down, and only you can.',
    lead: 'One search box across your notes, documents, receipts and emails. It matches exact things like an invoice number and near misses like a typo, and it only ever searches your own documents. The database enforces that, not just the application.',
    metaDescription:
      'Ask Your Life is one private search across your notes, receipts and documents, combining keyword and vector search, with row-level security per user. A My-Trove product.',
    does: [
      {
        title: 'Takes documents in several ways',
        text: 'Paste text, send JSON or upload a file: plain text, Markdown or HTML, labelled as a note, file, email or receipt.',
      },
      {
        title: 'Indexes in the background',
        text: 'Saving returns at once. A worker splits the text, indexes it and retries with backoff, and a failure shows as a status instead of vanishing.',
      },
      {
        title: 'Searches by keyword and by similarity at once',
        text: 'Switch to keyword-only or similarity-only if you want. Filter by source type and date.',
      },
      {
        title: 'Shows where the match is',
        text: 'One result per document, with the best passage and the matching words highlighted.',
      },
      {
        title: 'Can explain a ranking',
        text: 'An explain view shows the keyword rank, the similarity rank and how they were combined.',
      },
    ],
    steps: [
      {
        title: 'Add a document',
        text: 'The document and its indexing job are saved in one transaction, so nothing is saved without being scheduled.',
      },
      {
        title: 'A worker indexes it',
        text: 'It cuts the text into overlapping passages, turns each into a vector and swaps them in atomically.',
      },
      {
        title: 'You search',
        text: 'A keyword list and a similarity list are built in one SQL statement.',
      },
      {
        title: 'The lists are fused',
        text: 'Reciprocal rank fusion combines positions, not scores, so no tuning between the two is needed.',
      },
    ],
    tech: [
      {
        name: 'pgvector with Postgres full-text search',
        what: 'Keyword matching and vector similarity, fused by rank.',
        why: 'Keywords miss paraphrases. Vectors miss exact identifiers such as INV-2231. Together they cover both.',
      },
      {
        name: 'Row-level security',
        what: 'The database filters every query by the signed-in owner, and returns nothing if the owner is not set.',
        why: 'A forgotten WHERE clause in a future query returns an empty page instead of someone else’s notes.',
      },
      {
        name: 'A queue that cannot lose work',
        what: 'Jobs are claimed with SKIP LOCKED, leased, retried with backoff and moved aside after repeated failure.',
        why: 'Embedding is slow and must not run inside the upload request or hold locks.',
      },
    ],
    notYet: [
      'The default embedder is lexical. It tolerates typos and word endings but does not know that car and automobile are related. A real model can be plugged in; none has been tried.',
      'There is no PDF or image text extraction. A PDF upload is refused with a clear message.',
      'Row-level security guards against application bugs. It does not protect against someone with database access, and your text is stored in the database as plain text.',
      'Stemming is English only.',
    ],
  },
  {
    id: 'digital-legacy',
    name: 'Digital Legacy',
    tagline: 'Hand on what matters',
    summary:
      'A dead-man’s switch that releases an encrypted vault to trusted people only if you stop checking in and enough of them agree.',
    hardPart: 'End-to-end encryption and threshold key sharing',
    headline: 'Hand on what matters, only if you stop checking in.',
    lead: 'Store instructions, account locations and secrets for the people you would leave behind. If you stop checking in, your trusted people are asked to approve, and the vault opens only when enough of them agree and you have not come back. The server can never read what is inside.',
    metaDescription:
      'Digital Legacy is a dead-man’s switch: an end-to-end encrypted vault whose key is split among trustees and released only if you stop checking in. A My-Trove product.',
    does: [
      {
        title: 'Encrypts on your device',
        text: 'Your secrets are sealed with AES-256-GCM before they leave the browser. The server stores a blob it cannot open.',
      },
      {
        title: 'Splits the key among trustees',
        text: 'Shamir’s scheme divides the key so that any t of n trustees can rebuild it and fewer reveal nothing. Each share is sealed to one trustee’s public key.',
      },
      {
        title: 'Lets you set the rules',
        text: 'Check-in interval, grace period, escalation steps, cool-off, quorum, and vacation pauses with limits.',
      },
      {
        title: 'Needs no account for trustees',
        text: 'A trustee accepts an invitation, gives a public key and votes. Their access token is shown once.',
      },
      {
        title: 'Records every decision',
        text: 'Release decisions go into an append-only, hash-chained audit trail you can verify.',
      },
    ],
    steps: [
      {
        title: 'Active',
        text: 'You check in on your schedule. Any check-in from any stage returns you here.',
      },
      {
        title: 'Grace',
        text: 'A check-in is overdue. Nothing has happened yet.',
      },
      {
        title: 'Escalating',
        text: 'A ladder of reminders, to you first and then to trustees, with rising urgency.',
      },
      {
        title: 'Release pending',
        text: 'Trustees are asked to approve. Once enough approve, a cool-off window starts.',
      },
      {
        title: 'Released',
        text: 'Only if the quorum held through the whole cool-off and you did not check in. Trustees can then fetch their share and the ciphertext.',
      },
    ],
    tech: [
      {
        name: 'End-to-end encryption',
        what: 'WebCrypto in the browser, with shares sealed per trustee and bound to the vault and key version.',
        why: 'The operator, and anyone who breaches it, must not be able to read what people leave behind.',
      },
      {
        name: 'Shamir secret sharing over GF(256)',
        what: 'About 150 lines, tested on every combination of t shares for many settings, with mismatched or tampered sets rejected.',
        why: 'No single trustee, and no minority, can open the vault.',
      },
      {
        name: 'A durable state machine',
        what: 'Timing is a pure function and the next due moment is stored, so a restart or a late scheduler produces the same outcome.',
        why: 'A missed check-in must lead to the same result whatever the servers were doing.',
      },
    ],
    notYet: [
      'It does not message anyone. The reminder channels are log stubs, with no email, SMS or push.',
      'A malicious server could swap a trustee’s public key. Owner and trustee must compare key fingerprints in person or by phone, and the protocol does not force it.',
      'Approval is a server-side vote. Release is a policy gate, not a cryptographic one.',
      'If the vault key and enough trustee keys are lost, nothing can recover it. That is inherent to end-to-end encryption.',
      'There is no vault erase yet, and one vault per owner.',
    ],
  },
  {
    id: 'family-treasury',
    name: 'Family Treasury',
    tagline: 'Household books that add up',
    summary:
      'A shared household ledger with approvals and allowances. Bookkeeping only: no money moves.',
    hardPart: 'A double-entry ledger whose rules live in the database',
    headline: 'Keep the household books so they always add up.',
    lead: 'A shared ledger for a family fund, a trip pot or the kids’ allowances. Deposits and spends are recorded, big spends wait for a second person, allowances post on schedule, and the books cannot quietly go out of balance. This is bookkeeping. No money moves.',
    metaDescription:
      'Family Treasury is a shared household ledger with approvals, allowances and a double-entry design the database enforces. Bookkeeping only. A My-Trove product.',
    does: [
      {
        title: 'Gives a household a pool and pots',
        text: 'One shared pool, a pot for each member, and categories you add.',
      },
      {
        title: 'Records deposits, spends, transfers and splits',
        text: 'Every entry is two or more postings that sum to zero, in whole minor units, never floating point.',
      },
      {
        title: 'Holds big spends for a second person',
        text: 'Above your threshold a spend waits for a different approver. No ledger entry exists until it is approved.',
      },
      {
        title: 'Pays allowances on schedule',
        text: 'Each period is paid exactly once. A missed period is recorded as skipped, not back-paid.',
      },
      {
        title: 'Corrects with reversals, never edits',
        text: 'A mistake is undone by a new entry that negates the old one. Statements show a running balance and export as CSV.',
      },
    ],
    steps: [
      {
        title: 'Create a household',
        text: 'You become the owner. A pool, a deposits account, a general expense account and your pot are created.',
      },
      {
        title: 'Record money in and out',
        text: 'Each request carries an idempotency key, so a retry never posts twice.',
      },
      {
        title: 'Approvals gate the big ones',
        text: 'A spend above the threshold returns pending and writes nothing until a different owner or approver agrees.',
      },
      {
        title: 'Reconcile',
        text: 'The running balances are compared with the sum of the postings. Any drift is reported per account, not silently repaired.',
      },
    ],
    tech: [
      {
        name: 'Database-enforced double entry',
        what: 'A deferred trigger rejects, at commit, any entry whose postings do not sum to zero in each currency. Postings cannot be updated or deleted.',
        why: 'A ledger is only worth anything if no bug or future script can quietly unbalance it.',
      },
      {
        name: 'Idempotency keys',
        what: 'A retry with the same key replays the first answer. The same key with a different request is refused.',
        why: 'Money software must survive a double click and a flaky connection.',
      },
      {
        name: 'A read model that is checked',
        what: 'Balances are updated in the same transaction as the postings, and a reconciliation compares them with the ledger.',
        why: 'Fast reads, and a way to prove they are right.',
      },
    ],
    notYet: [
      'It moves no money. There is no bank, card or payment integration.',
      'There is no currency conversion. Every entry is in one currency.',
      'There are no notifications when an approval is waiting.',
      'Reconciliation reports drift but has no repair command. The guards also depend on the database role not owning the tables.',
    ],
  },
]

const byId = new Map(products.map((product) => [product.id, product]))

export function getProduct(id: string): ProductContent | undefined {
  return byId.get(id as ProductId)
}
