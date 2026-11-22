// Household (hub), end to end on the live stack, as real personas:
//   owner creates a household and an invite code; a second real account joins with the code; the owner adds a
//   shared reminder and uploads a shared file; both accounts see them.
//   node dev/audit/household.mjs            (dev/up.sh and dev/web.sh hub must be running)
import { SCREENSHOT_DIR, check, launch, shot, signIn, step } from './lib.mjs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const APP = process.env.HUB_URL || 'http://localhost:5181'
const OWNER = 'dev@example.test'
const MEMBER = 'member@example.test'
const stamp = Date.now().toString(36)
const HOUSEHOLD = `Audit house ${stamp}`
const REMINDER = `Shared reminder ${stamp}`
const FILE_NAME = `audit-note-${stamp}.txt`

const browser = await launch()
const sessions = []
const open = async (email) => {
  const s = await signIn(browser, APP, email)
  sessions.push(s)
  return s
}

try {
  step('owner creates a household')
  const owner = await open(OWNER)
  await owner.page.goto(`${APP}/households`, { waitUntil: 'networkidle' })
  await owner.page.getByRole('button', { name: 'Create household' }).first().click()
  await owner.page.locator('[role=dialog] input').first().fill(HOUSEHOLD)
  await owner.page.locator('[role=dialog]').getByRole('button', { name: /Create household/ }).last().click()
  await owner.page.waitForURL(/\/households\/[0-9a-f-]+$/)
  const householdId = owner.page.url().split('/').pop()
  check(householdId.length > 10, `household created (${householdId})`)

  step('owner creates a single-use invite code')
  await owner.page.getByRole('button', { name: 'Create invite code' }).click()
  await owner.page.waitForTimeout(800)
  const code = (await owner.page.getByTestId('invite-code').innerText()).trim()
  check(code.length >= 20, 'invite code is shown once')

  step('member joins with the code')
  const member = await open(MEMBER)
  await member.page.goto(`${APP}/households`, { waitUntil: 'networkidle' })
  await member.page.getByRole('button', { name: 'Join with a code' }).first().click()
  await member.page.locator('[role=dialog] input').first().fill(code)
  await member.page.locator('[role=dialog]').getByRole('button', { name: /join/i }).last().click()
  await member.page.waitForURL(new RegExp(`/households/${householdId}$`))
  await member.page.getByText('Your role:').first().waitFor({ timeout: 15000 })
  const memberView = await member.page.innerText('body')
  check(/Your role:\s*Member/.test(memberView), `member lands on the household as a Member (${memberView.slice(0, 160).replace(/\n/g, ' | ')})`)

  // A second use of the same code must fail: the code is single-use.
  step('the same code cannot be used a second time')
  const late = await open('developer@example.test')
  await late.page.goto(`${APP}/households`, { waitUntil: 'networkidle' })
  await late.page.getByRole('button', { name: 'Join with a code' }).first().click()
  await late.page.locator('[role=dialog] input').first().fill(code)
  await late.page.locator('[role=dialog]').getByRole('button', { name: /join/i }).last().click()
  await late.page.waitForTimeout(1000)
  check(/invalid, already used or expired/i.test(await late.page.innerText('body')), 'a used code is refused')

  step('owner adds a shared reminder for the household')
  await owner.page.goto(`${APP}/reminders?household=${householdId}`, { waitUntil: 'networkidle' })
  const reminderForm = owner.page.getByRole('form', { name: 'Add a reminder' })
  await reminderForm.getByLabel('Remind me to').fill(REMINDER)
  await reminderForm.getByLabel('For').selectOption(householdId)
  await reminderForm.getByRole('button', { name: 'Add reminder' }).click()
  await owner.page.waitForTimeout(1000)
  check((await owner.page.innerText('body')).includes(REMINDER), 'owner sees the reminder')

  step('owner uploads a shared file')
  const notePath = join(SCREENSHOT_DIR, FILE_NAME)
  writeFileSync(notePath, 'Shared household note for the audit check.\n')
  await owner.page.goto(`${APP}/files?household=${householdId}`, { waitUntil: 'networkidle' })
  const uploadForm = owner.page.getByRole('form', { name: 'Upload a file' })
  await uploadForm.locator('input[type=file]').setInputFiles(notePath)
  await uploadForm.getByLabel('Save to').selectOption(householdId)
  await uploadForm.getByRole('button', { name: 'Upload' }).click()
  await owner.page.waitForTimeout(1500)
  check((await owner.page.innerText('body')).includes(FILE_NAME), 'owner sees the file')

  step('member sees the shared reminder and file')
  await member.page.goto(`${APP}/reminders?household=${householdId}`, { waitUntil: 'networkidle' })
  await member.page.waitForTimeout(800)
  check((await member.page.innerText('body')).includes(REMINDER), 'member sees the shared reminder')
  await member.page.goto(`${APP}/files?household=${householdId}`, { waitUntil: 'networkidle' })
  await member.page.waitForTimeout(800)
  check((await member.page.innerText('body')).includes(FILE_NAME), 'member sees the shared file')
  await shot(member.page, 'household-member-files')

  // The refused second redemption logs the browser's own "400 (Bad Request)" resource message; that one is expected.
  const errors = sessions
    .flatMap((s) => s.errors)
    .filter((text) => !/status of 4\d\d|Failed to load resource/.test(text))
  check(errors.length === 0, `no unexpected page errors in any session (${errors.join(' || ') || 'none'})`)
  console.log('\nHOUSEHOLD FLOW PASSED')
} finally {
  await browser.close()
}
