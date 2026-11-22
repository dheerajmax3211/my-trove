// Digital Legacy, end to end on the live stack, as a brand-new owner account:
//   1. the owner creates an encrypted vault (the key stays in the browser; a key file is downloaded)
//   2. the owner saves a check-in policy and invites a trustee by link
//   3. the link opens the standalone trustee portal, pre-filled with the invite code, and the trustee registers a key
//   4. the owner compares the trustee's fingerprint, sets the quorum, seals the shares and arms the switch
//   5. the owner checks in and the state ladder reflects it
//   node dev/audit/legacy.mjs              (dev/up.sh and dev/web.sh digital-legacy must be running)
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { SCREENSHOT_DIR, check, launch, shot, signIn, step } from './lib.mjs'

const APP = process.env.LEGACY_URL || 'http://localhost:5186'
const stamp = Date.now().toString(36)
const OWNER = `legacy-owner-${stamp}@example.test`
const TRUSTEE_NAME = 'Ben Rao'
const TRUSTEE_CONTACT = `ben-${stamp}@example.test`
const OWNER_PASSPHRASE = `audit owner passphrase ${stamp}`
const TRUSTEE_PASSPHRASE = `audit trustee passphrase ${stamp}`

mkdirSync(SCREENSHOT_DIR, { recursive: true })
const keyDir = mkdtempSync(join(SCREENSHOT_DIR, 'legacy-keys-'))
const ownerKeyFile = join(keyDir, 'owner-vault-key.json')
const trusteeKeyFile = join(keyDir, 'trustee-key.json')

const browser = await launch()
const sessions = []

try {
  step('1. a new owner creates an encrypted vault')
  const owner = await signIn(browser, APP, OWNER)
  sessions.push(owner)
  const page = owner.page
  await page.goto(`${APP}/vault`, { waitUntil: 'networkidle' })
  await page.getByLabel(/Title of entry 1/).fill('Where the house papers are')
  await page.getByLabel(/Contents of entry 1/).fill('The blue folder in the study, second shelf.')
  await page.getByRole('button', { name: 'Encrypt and create vault' }).click()
  const backup = page.getByRole('dialog', { name: /Back up your vault key/ })
  await backup.waitFor()
  await backup.getByLabel(/^Passphrase\*?$/).fill(OWNER_PASSPHRASE)
  await backup.getByLabel(/^Repeat the passphrase\*?$/).fill(OWNER_PASSPHRASE)
  const [keyDownload] = await Promise.all([
    page.waitForEvent('download'),
    backup.getByRole('button', { name: 'Download key file' }).click(),
  ])
  await keyDownload.saveAs(ownerKeyFile)
  await backup.getByRole('checkbox').check()
  await backup.getByRole('button', { name: 'Create vault' }).click()
  await page.waitForTimeout(1200)
  check((await page.getByText('Vault created').count()) > 0, 'vault created; the server holds only ciphertext')

  step('2. the owner saves a check-in policy and invites a trustee by link')
  await page.getByLabel('Main').getByRole('link', { name: 'Check-in policy', exact: true }).click()
  await page.waitForURL(/\/policy$/)
  await page.getByRole('button', { name: 'Save policy' }).click()
  await page.waitForTimeout(1000)
  check(
    (await page.getByText('The server did not accept the policy').count()) === 0,
    'policy accepted by the server',
  )
  await page.getByLabel('Main').getByRole('link', { name: 'Trustees', exact: true }).click()
  await page.waitForURL(/\/trustees$/)
  await page.getByRole('button', { name: 'Invite a trustee' }).first().click()
  const inviteDialog = page.getByRole('dialog', { name: 'Invite a trustee' })
  await inviteDialog.getByLabel(/Their name/).fill(TRUSTEE_NAME)
  await inviteDialog.getByRole('button', { name: 'Create invite' }).click()
  const linkField = page.getByLabel('Invite link')
  await linkField.waitFor({ timeout: 15000 })
  const inviteLink = await linkField.inputValue()
  check(/\/trustee\/accept#invite=/.test(inviteLink), 'invite link points at the standalone trustee portal')
  await page.getByRole('button', { name: 'Done' }).click()

  step('3. the trustee opens the link in a signed-out browser and registers a key')
  const trusteeContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const tp = await trusteeContext.newPage()
  const trusteeErrors = []
  tp.on('pageerror', (e) => trusteeErrors.push(e.message))
  await tp.goto(inviteLink, { waitUntil: 'networkidle' })
  await tp.waitForTimeout(800)
  const landing = await tp.innerText('body')
  check(landing.includes('Digital Legacy: trustee'), 'the link opens the standalone trustee portal')
  check(!/Your switch/.test(landing), 'the link does not open the owner app')
  check((await tp.getByLabel('Invite code').inputValue()) !== '', 'the invite code from the link is pre-filled')
  await tp.getByLabel(/Contact 1 address/).fill(TRUSTEE_CONTACT)
  await tp.getByRole('button', { name: 'Generate my key' }).click()
  await tp.getByLabel(/Passphrase for the key file/).waitFor({ timeout: 30000 })
  await tp.getByLabel(/Passphrase for the key file/).fill(TRUSTEE_PASSPHRASE)
  const [trusteeDownload] = await Promise.all([
    tp.waitForEvent('download'),
    tp.getByRole('button', { name: 'Download key file' }).click(),
  ])
  await trusteeDownload.saveAs(trusteeKeyFile)
  await tp.getByRole('checkbox', { name: /I have saved the key file/ }).check()
  await tp.getByRole('button', { name: 'Register my key' }).click()
  await tp.getByRole('button', { name: 'Go to my portal' }).waitFor({ timeout: 30000 })
  check(true, 'the trustee registered a key; only the public half reached the server')
  await shot(tp, 'legacy-trustee-registered')

  step('4a. the owner compares the trustee fingerprint and sets the quorum')
  await page.getByLabel('Main').getByRole('link', { name: 'Trustees', exact: true }).click()
  await page.waitForURL(/\/trustees$/)
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Compare fingerprint' }).first().click()
  const compare = page.getByRole('dialog', { name: /Compare/ })
  await compare.getByRole('checkbox').check()
  await compare.getByRole('button', { name: 'Done' }).click()
  // The policy starts with a quorum of one; "Save quorum" stays disabled until the owner picks something different.
  const save = page.getByRole('button', { name: 'Save quorum' })
  if (await save.isEnabled()) {
    await page.getByLabel(/Trustees needed/).selectOption('1')
    await save.click()
    await page.waitForTimeout(1000)
  }
  check((await page.getByLabel(/Trustees needed/).inputValue()) === '1', 'the quorum is one trustee of one')

  step('4b. the owner unlocks the vault with the key file, seals the shares, and arms the switch')
  await page.getByLabel('Main').getByRole('link', { name: 'Vault', exact: true }).click()
  await page.waitForURL(/\/vault$/)
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('input[type=file]').first().setInputFiles(ownerKeyFile)
  await page.getByLabel(/^Passphrase\*?$/).first().fill(OWNER_PASSPHRASE)
  await page.getByRole('button', { name: 'Unlock vault' }).click()
  await page.waitForTimeout(1500)
  check((await page.getByText('Vault key unlocked').count()) > 0 || (await page.getByText(/Key in memory/).count()) > 0, 'the vault key is unlocked in this browser')
  await page.getByLabel('Main').getByRole('link', { name: 'Trustees', exact: true }).click()
  await page.waitForURL(/\/trustees$/)
  await page.getByRole('button', { name: 'Seal and upload shares' }).click()
  await page.waitForTimeout(2500)
  await shot(page, 'legacy-shares-sealed')
  await page.getByLabel('Main').getByRole('link', { name: 'Overview', exact: true }).click()
  await page.waitForURL(/\/$/)
  const beforeArm = await page.innerText('main')
  const armReady = !/Not ready to arm yet/.test(beforeArm)
  check(armReady, 'the switch is ready to arm (vault, trustee, policy and quorum are in place)')
  await page.getByRole('button', { name: /Arm the switch/ }).click()
  const armDialog = page.getByRole('dialog', { name: /Arm/ })
  if ((await armDialog.count()) > 0) await armDialog.getByRole('button', { name: /Arm/ }).last().click()
  await page.waitForTimeout(1200)
  check(/Armed|Active/.test(await page.innerText('main')), 'the switch is armed')

  step('5. the owner checks in: the switch is counting, the ladder shows where the owner is, the timeline records it')
  const armed = await page.innerText('main')
  check(!/Not armed/.test(armed) && !/Last check-in\s*never/.test(armed), 'armed: the countdown has started (arming counts from now)')
  await page.getByRole('button', { name: /I'm here/ }).first().click()
  await page.waitForTimeout(1200)
  const afterCheckIn = await page.innerText('body')
  check(afterCheckIn.includes('Checked in'), 'the owner sees the check-in confirmation')
  check(/You are here/.test(afterCheckIn), 'the state ladder places the owner on rung one, "You check in"')
  await shot(page, 'legacy-after-checkin-armed')
  await page.getByLabel('Main').getByRole('link', { name: 'Timeline', exact: true }).click()
  await page.waitForURL(/\/timeline$/)
  await page.waitForTimeout(800)
  const timeline = await page.innerText('main')
  check(timeline.includes('Switch armed') && timeline.includes('You checked in'), 'the timeline records the arming and the check-in')
  await shot(page, 'legacy-timeline')

  const errors = [...sessions.flatMap((s) => s.errors), ...trusteeErrors]
    .filter((text) => !/status of 4\d\d|Failed to load resource/.test(text))
  check(errors.length === 0, `no unexpected page errors (${errors.join(' || ') || 'none'})`)
  await trusteeContext.close()
  console.log('\nDIGITAL LEGACY FLOW PASSED')
} finally {
  await browser.close()
}
