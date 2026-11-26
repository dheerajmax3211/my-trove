#!/usr/bin/env node
// Browser proof for the Waiting On, Consent and Ask Your Life flows, against the live dev stack.
// Signs in as the MEMBER persona with the dev identity provider ("Email me a link", no password), walks each
// product's main flow in a real browser and asserts what the user sees. Complements dev/e2e-waiting-consent-ask.sh,
// which proves the same flows through the API.
//
//   dev/web.sh                                      # the workspace (5190); every product is a module inside it
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs node dev/e2e-waiting-consent-ask-ui.mjs
//
// Needs the playwright-core package (not a repo dependency) and a Chromium: set CHROME_PATH to an installed
// Chrome or headless-shell binary, or run `npx playwright install chromium` once. Screenshots go to
// dev/.state/e2e-shots (git-ignored). Exits non-zero on the first failed check.

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, '.state', 'e2e-shots');
mkdirSync(SHOTS, { recursive: true });

const WS = (process.env.WORKSPACE_URL ?? 'http://localhost:5190').replace(/\/+$/, '');
const WAITING_ON = `${WS}/app/waiting-on`;
const CONSENT = `${WS}/app/consent`;
const ASK = `${WS}/app/ask-your-life`;
const MEMBER = process.env.MEMBER_EMAIL ?? 'member@example.test';
const IDP = process.env.IDP_URL ?? 'http://localhost:9100';
const RUN = Date.now();

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    console.log(`  FAIL  ${name}\n        ${String(e.message ?? e).split('\n')[0]}`);
    await page.screenshot({ path: resolve(SHOTS, `fail-${passed + 1}.png`), fullPage: true }).catch(() => {});
    await browser.close();
    process.exit(1);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
// Signs in to the workspace through its dev account chooser (the same path a person takes with the dev identity
// provider), as the seeded member, and skips the first-run wizard if it shows.
async function signIn(base) {
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  const google = page.getByRole('button', { name: 'Continue with Google' });
  if (!(await google.count())) return; // already signed in
  await google.first().click();
  await page.getByRole('button', { name: new RegExp(`^Sign in as Member, ${MEMBER}$`) }).click();
  await page.waitForLoadState('networkidle');
  const skip = page.getByRole('button', { name: 'Skip for now' });
  await skip.first().waitFor({ state: 'visible', timeout: 6000 }).then(() => skip.first().click()).catch(() => {});
  await page.waitForTimeout(800);
}
const mainText = async () => page.locator('main').innerText();
const shot = (name) => page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: true });

console.log('== Waiting On');
await signIn(WS);
await check('the first screen says what it does and that you send the letters', async () => {
  await page.goto(WAITING_ON + '/', { waitUntil: 'networkidle' });
  expect((await mainText()).includes('letters'), 'home does not mention letters');
});
const title = `E2E refund ${RUN}`;
await check('add a refund that is already overdue', async () => {
  await page.goto(WAITING_ON + '/new', { waitUntil: 'networkidle' });
  await page.getByLabel('What are you waiting for?').fill(title);
  await page.getByLabel('Who are you waiting on?').fill('ACME Support');
  await page.getByLabel('Category').selectOption({ label: 'Refund' });
  await page.getByLabel('Expected by').fill('2026-11-01');
  await page.getByRole('button', { name: 'Start tracking' }).click();
  await page.waitForURL(/\/items\//, { timeout: 15000 });
  await page.getByRole('heading', { name: title }).waitFor({ timeout: 15000 });
  expect((await mainText()).includes(title), 'detail page does not show the new item');
});
await check('the detail shows the follow-up status, and a pasted reply is read and moves the follow-up', async () => {
  const text = await mainText();
  expect(text.includes('Follow-up status'), 'no follow-up status card');
  expect(text.includes('Overdue by'), 'overdue item not flagged');
  expect(!text.includes('Not connected yet'), 'reply card still says replies are not connected');
  expect(!(await page.getByRole('button', { name: 'Copy reply address' }).count()), 'reply address still has a copy button');
  const reply = page.getByRole('region', { name: 'Their reply' });
  await reply.getByLabel(/What did they say/).fill('Your refund has been processed.');
  await reply.getByRole('button', { name: 'Record reply' }).click();
  await page.getByTestId('reply-outcome').waitFor({ timeout: 15000 });
  expect((await page.getByTestId('reply-outcome').innerText()).includes('Read as paid or approved'), 'reply was not read as paid');
  await shot('waiting-on-detail');
});
await check('the paid reply closes the item through the follow-up workflow', async () => {
  // The reply was read as paid, so the workflow resolves the item; the detail page picks it up on reload.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.innerText.includes('This item is resolved'), null, { timeout: 30000, polling: 1000 });
});

console.log('== Consent');
// already signed in to the workspace
await check('the overview says what Consent does, in one sentence', async () => {
  await page.goto(CONSENT + '/', { waitUntil: 'networkidle' });
  expect((await mainText()).includes('take it back any time'), 'overview does not state the product line');
});
const attr = `profile.e2e.k${RUN}`;
await check('store an attribute in the vault', async () => {
  await page.goto(CONSENT + '/vault', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /add attribute/i }).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Key path').fill(attr);
  await dlg.getByLabel('Value (JSON)').fill('"e2e"');
  await dlg.getByRole('button', { name: /save attribute/i }).click();
  await page.waitForTimeout(1200);
  expect((await mainText()).includes(attr.split('.').pop()), 'attribute not listed in the vault');
});
await check('the access history and audit pages load', async () => {
  await page.goto(CONSENT + '/history', { waitUntil: 'networkidle' });
  expect((await mainText()).includes('Access history'), 'history page did not load');
  await page.goto(CONSENT + '/audit', { waitUntil: 'networkidle' });
  expect((await page.locator('main').innerText()).length > 0, 'audit page empty');
  await shot('consent-audit');
});

console.log('== Ask Your Life');
// already signed in to the workspace
const phrase = `Nonna's lasagne (e2e ${RUN}): three layers, a bechamel white sauce.`;
await check('add a note and see it indexed', async () => {
  await page.goto(ASK + '/add', { waitUntil: 'networkidle' });
  await page.getByLabel('Title').first().fill(`Lasagne e2e ${RUN}`);
  await page.getByLabel('Note*').fill(phrase);
  await page.getByRole('button', { name: 'Save note' }).click();
  await page.getByText('Indexed. You can find it with search.').waitFor({ timeout: 30000 });
});
await check('find it by what you remember, and say why', async () => {
  await page.goto(ASK + '/', { waitUntil: 'networkidle' });
  // the product's own box, not the workspace header's command search
  const box = page.getByLabel('Search your notes, documents and receipts');
  await box.fill('that pasta recipe with the white sauce');
  await box.press('Enter');
  await page.getByText(`Lasagne e2e ${RUN}`).first().waitFor({ timeout: 15000 });
  await shot('ask-results');
});
await check('semantic search says honestly what it is: a small local model', async () => {
  const text = await mainText();
  expect(text.includes('small local model'), 'the semantic mode does not explain its model');
  expect(!text.includes('stand-in'), 'the page still calls semantic search a stand-in');
});

await browser.close();
if (errors.length) console.log(`  note: ${errors.length} uncaught page error(s) during the run`);
console.log(`\nRESULT: ${passed} checks passed`);
