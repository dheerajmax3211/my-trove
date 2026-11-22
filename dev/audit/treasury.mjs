// Family Treasury, end to end on the live stack, as real personas:
//   owner deposits; a member spends above the approval limit; a second account joins as approver by invite code and
//   approves one spend and rejects another; the ledger and balances move accordingly.
//   node dev/audit/treasury.mjs            (dev/up.sh and dev/web.sh family-treasury must be running)
import { check, launch, shot, signIn, step } from './lib.mjs'

const APP = process.env.TREASURY_URL || 'http://localhost:5187'
const OWNER = 'dev@example.test'
const MEMBER = 'member@example.test'
const APPROVER = 'developer@example.test'
const stamp = Date.now().toString(36)
const HOUSEHOLD = `Audit treasury ${stamp}`
const APPROVE_TITLE = `Bicycle repair ${stamp}`
const REJECT_TITLE = `Garden fence ${stamp}`

const browser = await launch()
const sessions = []

/** Chooses the household pool as the source of a spend (native select, matched by option text). */
async function pickPool(page) {
  const select = page.getByLabel('Paid from')
  const value = await select.locator('option', { hasText: /Household pool/ }).first().getAttribute('value')
  check(Boolean(value), 'household pool is offered as a source of spending')
  await select.selectOption(value)
}
const open = async (email) => {
  const s = await signIn(browser, APP, email)
  sessions.push(s)
  return s
}

try {
  // ---- owner creates the household with an approval limit of 50 ----
  step('owner creates a household with an approval limit of US$50')
  const owner = await open(OWNER)
  await owner.page.goto(`${APP}/welcome`, { waitUntil: 'networkidle' })
  await owner.page.getByLabel(/Household name/).fill(HOUSEHOLD)
  await owner.page.getByLabel(/Approval limit/).fill('50')
  await owner.page.getByRole('button', { name: 'Create household' }).click()
  await owner.page.waitForURL(/\/h\/[0-9a-f-]+/)
  const householdId = owner.page.url().split('/h/')[1].split(/[/?#]/)[0]
  check(householdId.length > 10, `household created (${householdId})`)

  // ---- owner invites a member and an approver by code ----
  step('owner invites a member and an approver by single-use code')
  const createInvite = async (role) => {
    await owner.page.goto(`${APP}/h/${householdId}/members`, { waitUntil: 'networkidle' })
    await owner.page.getByLabel('Joins as').selectOption(role)
    await owner.page.getByRole('button', { name: 'Create invite code' }).click()
    const code = (await owner.page.getByTestId('invite-code').innerText()).trim()
    check(code.length >= 20, `${role} invite code shown once (${code.length} chars)`)
    return code
  }
  const memberCode = await createInvite('Member')
  const approverCode = await createInvite('Approver')
  await shot(owner.page, 'treasury-owner-invites')

  // ---- owner deposits ----
  step('owner deposits US$200 into the household pool')
  await owner.page.goto(`${APP}/h/${householdId}/move?tab=deposit`, { waitUntil: 'networkidle' })
  await owner.page.getByLabel(/^Amount/).fill('200')
  await owner.page.getByLabel(/What is it for/).fill('Opening deposit')
  await owner.page.getByRole('button', { name: 'Record deposit' }).click()
  await owner.page.waitForTimeout(800)
  await owner.page.goto(`${APP}/h/${householdId}`, { waitUntil: 'networkidle' })
  const dash = await owner.page.innerText('main')
  check(dash.includes('$200.00') || dash.includes('US$200.00'), 'dashboard shows the pool at US$200.00')

  // ---- member joins by code and spends above the limit ----
  step('member joins with the code and sends a US$80 spend for approval')
  const member = await open(MEMBER)
  await member.page.goto(`${APP}/welcome`, { waitUntil: 'networkidle' })
  await member.page.getByLabel(/Invite code/).fill(memberCode)
  await member.page.getByRole('button', { name: 'Join household' }).click()
  await member.page.waitForURL(new RegExp(`/h/${householdId}`))
  check(true, 'member landed on the household after joining')
  await member.page.goto(`${APP}/h/${householdId}/move?tab=spend`, { waitUntil: 'networkidle' })
  await pickPool(member.page)
  await member.page.getByLabel(/^Amount/).fill('80')
  await member.page.getByLabel(/What is it for/).fill(APPROVE_TITLE)
  await member.page.getByRole('button', { name: 'Send for approval' }).click()
  await member.page.waitForTimeout(800)
  check(
    (await member.page.innerText('main')).includes('approval'),
    'member sees that the US$80 spend is waiting for approval',
  )

  await member.page.goto(`${APP}/h/${householdId}/move?tab=spend`, { waitUntil: 'networkidle' })
  await pickPool(member.page)
  await member.page.getByLabel(/^Amount/).fill('60')
  await member.page.getByLabel(/What is it for/).fill(REJECT_TITLE)
  await member.page.getByRole('button', { name: 'Send for approval' }).click()
  await member.page.waitForTimeout(800)

  // ---- approver joins and decides ----
  step('approver joins with the code, approves one spend and rejects another')
  const approver = await open(APPROVER)
  await approver.page.goto(`${APP}/welcome`, { waitUntil: 'networkidle' })
  await approver.page.getByLabel(/Invite code/).fill(approverCode)
  await approver.page.getByRole('button', { name: 'Join household' }).click()
  await approver.page.waitForURL(new RegExp(`/h/${householdId}`))
  await approver.page.goto(`${APP}/h/${householdId}/approvals`, { waitUntil: 'networkidle' })
  await approver.page.waitForTimeout(500)
  await shot(approver.page, 'treasury-approver-pending')
  await approver.page.getByRole('button', { name: `Approve ${APPROVE_TITLE}` }).click()
  await approver.page.waitForTimeout(800)
  await approver.page.getByText(/^History/).first().click()
  await approver.page.waitForTimeout(500)
  const history = await approver.page.innerText('main')
  check(history.includes(APPROVE_TITLE) && /Approved/.test(history), 'approver sees the approved request in History')

  await approver.page.getByText(/^Needs a decision/).first().click()
  await approver.page.waitForTimeout(300)
  await approver.page.getByRole('button', { name: `Reject ${REJECT_TITLE}` }).click()
  await approver.page.getByRole('button', { name: 'Reject request' }).click()
  await approver.page.waitForTimeout(800)
  await approver.page.getByText(/^History/).first().click()
  await approver.page.waitForTimeout(500)
  check(
    (await approver.page.innerText('main')).includes(REJECT_TITLE) && /Rejected/.test(await approver.page.innerText('main')),
    'approver sees the rejected request in History',
  )

  // ---- balances moved by exactly the approved amount ----
  step('ledger and balances reflect the approved spend only')
  await owner.page.goto(`${APP}/h/${householdId}`, { waitUntil: 'networkidle' })
  await owner.page.waitForTimeout(500)
  const ownerDash = await owner.page.innerText('main')
  check(ownerDash.includes('$120.00') || ownerDash.includes('US$120.00'), 'pool is US$120.00 after the approved US$80')
  check(!ownerDash.includes('Rejected'), 'owner dashboard does not show the rejected request as posted')
  await owner.page.goto(`${APP}/h/${householdId}/activity`, { waitUntil: 'networkidle' })
  const activity = await owner.page.innerText('main')
  check(activity.includes(APPROVE_TITLE), 'approved spend is in the ledger activity')
  check(!activity.includes(REJECT_TITLE), 'rejected spend is not in the ledger')
  await shot(owner.page, 'treasury-owner-activity')

  const errors = sessions.flatMap((s) => s.errors)
  check(errors.length === 0, `no page errors in any session (${errors.length})`)
  console.log('\nTREASURY FLOW PASSED')
} finally {
  await browser.close()
}
