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

/**
 * The cast when the module runs inside the workspace's demo mode. The workspace signs in one person, the
 * stub "Demo User" (uid `demo-user`), so that person owns the lived-in household; Bob and Carol are the
 * people they share with.
 */
export const WORKSPACE_DEMO_USERS: readonly DemoUserSeed[] = [
  {
    uid: 'demo-user',
    userId: '0198a1ce-0000-7000-8000-000000000010',
    email: 'demo@example.test',
    displayName: 'Demo User',
    roles: ['USER'],
    blurb: 'Owns the demo household.',
  },
  DEMO_USERS[1] as DemoUserSeed,
  DEMO_USERS[2] as DemoUserSeed,
]

const DAY = 86_400_000
const SEED_FILE_TEXT =
  'Home insurance summary\nPolicy renews each spring. Premium is paid quarterly.\n'
const SEED_FILE_SHA256 = '7a7bc7acf74cbb9e011ecf66c0af3afca1d1729d87a142ee34374cfc1d8b8266'

export type SeedKind = 'demo' | 'empty'

/** Users always exist; `demo` adds a lived-in household, reminders, a file and audit history. */
export function createSeededState(
  kind: SeedKind,
  now: number,
  users: readonly DemoUserSeed[] = DEMO_USERS,
): State {
  const state = createState()
  const owner = users[0]?.uid ?? 'demo-alice'
  const member = users[1]?.uid ?? 'demo-bob'
  for (const u of users) {
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
    createdBy: owner,
    createdAt: created,
  })
  state.members.push(
    { householdId: home, uid: owner, role: 'OWNER', joinedAt: created },
    { householdId: home, uid: member, role: 'MEMBER', joinedAt: created + DAY },
  )
  recordAudit(state, created, owner, home, 'household.created', 'household', home, {
    name: 'Rivera household',
  })
  recordAudit(state, created + DAY, member, home, 'member.joined', 'member', member, {
    role: 'MEMBER',
  })

  const addReminder = (
    title: string,
    dueInDays: number,
    householdId: string | null,
    recurrence: { unit: 'DAILY' | 'WEEKLY' | 'MONTHLY'; interval: number } | null,
    status: 'ACTIVE' | 'COMPLETED' = 'ACTIVE',
    createdDaysAgo = 5,
  ) => {
    const id = state.nextId()
    const dueAt = now + dueInDays * DAY
    state.reminders.set(id, {
      id,
      ownerUid: owner,
      householdId,
      title,
      dueAt,
      anchorAt: dueAt,
      recurrence,
      status,
      lastFiredAt: status === 'COMPLETED' ? dueAt : null,
      createdAt: now - createdDaysAgo * DAY,
    })
    recordAudit(
      state,
      now - createdDaysAgo * DAY,
      owner,
      householdId,
      'reminder.created',
      'reminder',
      id,
      {
        title,
      },
    )
  }
  addReminder('Put the bins out', 0.15, home, { unit: 'WEEKLY', interval: 1 }, 'ACTIVE', 0.3)
  addReminder('Book the boiler service', 1.2, home, null, 'ACTIVE', 1)
  addReminder('Renew passport', 9, null, null)
  addReminder('Water the plants', 2, null, { unit: 'WEEKLY', interval: 1 })
  addReminder('Pay property tax', 5, home, { unit: 'MONTHLY', interval: 3 })
  addReminder('Book dentist', -3, null, null, 'COMPLETED')

  const fileId = state.nextId()
  const bytes = new TextEncoder().encode(SEED_FILE_TEXT)
  state.files.set(fileId, {
    id: fileId,
    ownerUid: owner,
    householdId: home,
    name: 'Home insurance summary.txt',
    contentType: 'text/plain',
    sizeBytes: bytes.byteLength,
    sha256: SEED_FILE_SHA256,
    createdAt: now - 4 * DAY,
    bytes,
  })
  recordAudit(state, now - 4 * DAY, owner, home, 'file.uploaded', 'file', fileId, {
    name: 'Home insurance summary.txt',
    sizeBytes: bytes.byteLength,
  })
  return state
}
