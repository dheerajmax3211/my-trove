import { createState, recordAudit, type State } from './state'

export interface DemoUserSeed {
  uid: string
  userId: string
  email: string
  displayName: string
  roles: readonly string[]
  /** One line for the demo sign-in screen. */
  blurb: string
}

export const DEMO_USERS: readonly DemoUserSeed[] = [
  {
    uid: 'demo-alice',
    userId: '0198a1ce-0000-7000-8000-000000000001',
    email: 'alice@example.test',
    displayName: 'Alice Rivera',
    roles: ['USER', 'ADMIN'],
    blurb: 'Owns the demo household and is an administrator.',
  },
  {
    uid: 'demo-bob',
    userId: '0198a1ce-0000-7000-8000-000000000002',
    email: 'bob@example.test',
    displayName: 'Bob Rivera',
    roles: ['USER'],
    blurb: 'A member of the demo household. Good for trying invites and roles.',
  },
  {
    uid: 'demo-carol',
    userId: '0198a1ce-0000-7000-8000-000000000003',
    email: 'carol@example.test',
    displayName: 'Carol Nguyen',
    roles: ['USER'],
    blurb: 'Not in any household yet. Accept an invite code as Carol.',
  },
]

const DAY = 86_400_000
const SEED_FILE_TEXT =
  'Home insurance summary\nPolicy renews each spring. Premium is paid quarterly.\n'
const SEED_FILE_SHA256 = '7a7bc7acf74cbb9e011ecf66c0af3afca1d1729d87a142ee34374cfc1d8b8266'

export type SeedKind = 'demo' | 'empty'

/** Users always exist; `demo` adds a lived-in household, reminders, a file and audit history. */
export function createSeededState(kind: SeedKind, now: number): State {
  const state = createState()
  for (const u of DEMO_USERS) {
    state.users.set(u.uid, {
      uid: u.uid,
      userId: u.userId,
      email: u.email,
      displayName: u.displayName,
      roles: new Set(u.roles),
    })
  }
  if (kind === 'empty') return state

  const home = state.nextId()
  const created = now - 30 * DAY
  state.households.set(home, {
    id: home,
    name: 'Rivera household',
    createdBy: 'demo-alice',
    createdAt: created,
  })
  state.members.push(
    { householdId: home, uid: 'demo-alice', role: 'OWNER', joinedAt: created },
    { householdId: home, uid: 'demo-bob', role: 'MEMBER', joinedAt: created + DAY },
  )
  recordAudit(state, created, 'demo-alice', home, 'household.created', 'household', home, {
    name: 'Rivera household',
  })
  recordAudit(state, created + DAY, 'demo-bob', home, 'member.joined', 'member', 'demo-bob', {
    role: 'MEMBER',
  })

  const addReminder = (
    title: string,
    dueInDays: number,
    householdId: string | null,
    recurrence: { unit: 'DAILY' | 'WEEKLY' | 'MONTHLY'; interval: number } | null,
    status: 'ACTIVE' | 'COMPLETED' = 'ACTIVE',
  ) => {
    const id = state.nextId()
    const dueAt = now + dueInDays * DAY
    state.reminders.set(id, {
      id,
      ownerUid: 'demo-alice',
      householdId,
      title,
      dueAt,
      anchorAt: dueAt,
      recurrence,
      status,
      lastFiredAt: status === 'COMPLETED' ? dueAt : null,
      createdAt: now - 5 * DAY,
    })
    recordAudit(
      state,
      now - 5 * DAY,
      'demo-alice',
      householdId,
      'reminder.created',
      'reminder',
      id,
      { title },
    )
  }
  addReminder('Renew passport', 9, null, null)
  addReminder('Water the plants', 2, null, { unit: 'WEEKLY', interval: 1 })
  addReminder('Pay property tax', 5, home, { unit: 'MONTHLY', interval: 3 })
  addReminder('Book dentist', -3, null, null, 'COMPLETED')

  const fileId = state.nextId()
  const bytes = new TextEncoder().encode(SEED_FILE_TEXT)
  state.files.set(fileId, {
    id: fileId,
    ownerUid: 'demo-alice',
    householdId: home,
    name: 'Home insurance summary.txt',
    contentType: 'text/plain',
    sizeBytes: bytes.byteLength,
    sha256: SEED_FILE_SHA256,
    createdAt: now - 4 * DAY,
    bytes,
  })
  recordAudit(state, now - 4 * DAY, 'demo-alice', home, 'file.uploaded', 'file', fileId, {
    name: 'Home insurance summary.txt',
    sizeBytes: bytes.byteLength,
  })
  return state
}
