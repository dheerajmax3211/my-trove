#!/usr/bin/env node
// Live check of "enter readings yourself" on the running dev stack, as the MEMBER persona.
//
//   BASE_URL     workspace origin (default http://localhost:5190)
//   PLAYWRIGHT_CORE  path to a playwright-core entry (index.mjs), e.g. from the npx cache
//   CHROME_PATH  a Chromium/headless-shell executable
//   SHOTS        directory for screenshots (default: the current directory)
//
// Signs in with the dev identity provider ("Email me a sign-in link", no password), adds a washing machine,
// saves two meter totals, imports two CSV rows, checks the labels, then stops manual entry. Exits 1 on the first
// failed check and prints what it was looking for.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5190'
const SHOTS = process.env.SHOTS ?? '.'
const CORE = process.env.PLAYWRIGHT_CORE
if (!CORE || !process.env.CHROME_PATH) {
  console.error(
    'Set PLAYWRIGHT_CORE (path to playwright-core index.mjs) and CHROME_PATH (a Chromium executable).',
  )
  process.exit(2)
}
const { chromium } = await import(pathToFileURL(CORE).href)
mkdirSync(SHOTS, { recursive: true })

const step = (name) => console.log(`- ${name}`)
const check = (ok, what) => {
  if (!ok) throw new Error(`Check failed: ${what}`)
}

// Local time as the datetime-local input wants it, `hoursAgo` before now.
const localStamp = (hoursAgo) => {
  const d = new Date(Date.now() - hoursAgo * 3_600_000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
try {
  step('sign in as member@example.test')
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.getByLabel('Email address').fill('member@example.test')
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await page
    .getByRole('button', { name: 'Skip for now' })
    .click({ timeout: 15_000 })
    .catch(() => {})

  const name = `Manual test washer ${Date.now() % 100000}`
  step(`add an appliance: ${name}`)
  await page.goto(`${BASE}/app/home-pulse/appliances/new`, { waitUntil: 'networkidle' })
  await page.getByRole('textbox', { name: /Name/ }).fill(name)
  await page.getByRole('combobox', { name: /Type/ }).selectOption('WASHING_MACHINE')
  await page.getByRole('button', { name: 'Add appliance' }).click()
  await page.getByRole('heading', { level: 1, name }).waitFor({ timeout: 15_000 })

  step('the page offers manual entry and says where its numbers come from')
  const card = page.getByRole('heading', { name: 'Enter readings yourself' })
  await card.waitFor({ timeout: 15_000 })
  check(await card.isVisible(), 'Enter readings yourself card is visible')

  step('save a first meter total (baseline) and a second one 30 minutes later')
  const kwh = page.getByRole('spinbutton', { name: /Total energy on the meter/ })
  const when = page.getByLabel(/When you read it/)
  await kwh.fill('100')
  await when.fill(localStamp(3))
  await page.getByRole('button', { name: 'Save reading' }).click()
  await page.getByText(/Saved as the starting point/).waitFor({ timeout: 15_000 })
  await kwh.fill('100.5')
  await when.fill(localStamp(2.5))
  await page.getByRole('button', { name: 'Save reading' }).click()
  await page.getByText(/Added 30 minutes at an average of 1,000 W/).waitFor({ timeout: 15_000 })
  await page.screenshot({ path: join(SHOTS, 'manual-after-meter.png'), fullPage: true })

  step('import two CSV rows')
  await page
    .getByRole('textbox', { name: /Rows: timestamp,watts/ })
    .fill(
      `${new Date(Date.now() - 1.5 * 3_600_000).toISOString()},118.4\n${new Date(Date.now() - 1.4 * 3_600_000).toISOString()},117.9`,
    )
  await page.getByRole('button', { name: 'Import rows' }).click()
  await page.getByText('Imported 2 readings.').waitFor({ timeout: 15_000 })

  step('chart and header say Entered by you')
  check(
    (await page.getByText(/Entered by you, last 24 hours/).count()) > 0,
    'chart source sentence',
  )

  step('devices page lists the manual source with no token')
  await page.goto(`${BASE}/app/home-pulse/devices`, { waitUntil: 'networkidle' })
  const row = page.getByRole('row', { name: /Entered by you/ })
  await row.waitFor({ timeout: 15_000 })
  check((await row.getByText('No token').count()) > 0, 'No token in the manual row')

  step('stop manual entry from the devices page (asks first, keeps the history)')
  await page.getByRole('button', { name: `Stop entering readings for ${name}` }).click()
  const dialog = page.getByRole('dialog', { name: `Stop entering readings for ${name}?` })
  await dialog.waitFor({ timeout: 15_000 })
  await dialog.getByRole('button', { name: 'Stop entering readings' }).click()
  await row.getByText('Revoked').waitFor({ timeout: 15_000 })
  console.log('PASS')
} catch (error) {
  console.error(`FAIL: ${error.message}`)
  await page.screenshot({ path: join(SHOTS, 'manual-failure.png'), fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
