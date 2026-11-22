// Shared helpers for the audit flow scripts. Each script drives a real browser against the live dev stack
// (dev/up.sh and dev/web.sh must be running) and exits non-zero on the first failed check.
//
// Playwright: set PLAYWRIGHT_CORE to the playwright-core package directory or entry file if it is not resolvable
// from here (for example a copy in the npx cache). Chrome: set CHROME_PATH to a Chrome/Chromium executable, or let
// Playwright use its own browser when one is installed.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)

export function loadPlaywright() {
  const spec = process.env.PLAYWRIGHT_CORE || 'playwright-core'
  try {
    return require(spec)
  } catch (error) {
    throw new Error(
      `Cannot load playwright-core (${spec}). Set PLAYWRIGHT_CORE to its path. ${error.message}`,
    )
  }
}

/** Screenshots are for reading during the audit, never for git. Set AUDIT_SHOTS to choose the folder. */
export const SCREENSHOT_DIR = process.env.AUDIT_SHOTS || join(tmpdir(), 'trove-audit-shots')

export async function launch() {
  const { chromium } = loadPlaywright()
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
  return chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  })
}

/** A fresh browser context signed in as `email` through the dev identity provider (no password). */
export async function signIn(browser, origin, email) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto(origin + '/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: /Email me a link|Finish sign-in/ }).click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  await dismissIntro(page)
  return { context, page, errors, email }
}

/** The first-use notice is a modal shown once per person; accept it so the page underneath is usable. */
export async function dismissIntro(page) {
  const understood = page.getByRole('button', { name: 'I understand' })
  try {
    await understood.first().click({ timeout: 2500 })
    await page.waitForTimeout(300)
  } catch {
    // not shown for this person
  }
}

export function check(condition, message) {
  if (!condition) throw new Error(`CHECK FAILED: ${message}`)
  console.log(`  ok  ${message}`)
}

export function step(title) {
  console.log(`\n== ${title}`)
}

export async function shot(page, name) {
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: true })
}
