#!/usr/bin/env node
// Browser checks for the developer console and the members' Connected apps, against the live dev stack (dev/up.sh) and
// a running workspace (dev/web.sh, default http://localhost:5190). Every step is a real sign-in through the dev chooser
// and a real click; the API is used only where the brief says so (setup and the independent checks at the end).
//
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs node dev/e2e-developer-ui.mjs
//   E2E_SHOTS=/some/dir node dev/e2e-developer-ui.mjs     (screenshots; default dev/.state/e2e-developer-ui)
//
// Developer checks: register an app, issue a key, use it in the playground, create a webhook to a local receiver, see a
// signed delivery, replay it, read the published docs index, revoke the key. Member checks: a consent grant is created
// through the consent gateway (client registered, request made, approved by the member), then the member disconnects it
// on the Account page. Exits non-zero if any check fails.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE || "playwright-core");

const WS = (process.env.WORKSPACE_URL || "http://localhost:5190").replace(/\/+$/, "");
const GW = (process.env.GATEWAY_URL || "http://localhost:8080").replace(/\/+$/, "");
const IDP = process.env.IDP_URL || "http://localhost:9100";
const KAFKA_CONTAINER = process.env.KAFKA_CONTAINER || "dev-kafka-1";
const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.E2E_SHOTS || join(HERE, ".state", "e2e-developer-ui");
const WORK = join(HERE, ".state", "e2e-developer-ui");
mkdirSync(SHOTS, { recursive: true });
mkdirSync(WORK, { recursive: true });
const RUN = Date.now();
const APP_NAME = `UI e2e ${RUN}`;
const KEY_NAME = `ui key ${RUN}`;
const HOOK_NAME = "reminder.created";
const CLIENT_NAME = `UI planner ${RUN}`;

let pass = 0;
let fail = 0;
const ok = (name) => {
  pass += 1;
  console.log(`  PASS  ${name}`);
};
const bad = (name, detail) => {
  fail += 1;
  console.log(`  FAIL  ${name}  (${detail})`);
};
async function check(name, fn) {
  try {
    const detail = await fn();
    if (detail === undefined || detail === true) ok(name);
    else bad(name, String(detail));
  } catch (error) {
    bad(name, error instanceof Error ? error.message.split("\n")[0] : String(error));
  }
}
const eq = (actual, expected) =>
  actual === expected ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;

// ---------------------------------------------------------------------------------------------------------------------
// The API, for setup and for the independent checks (never for the screens under test).

async function devToken(email) {
  const response = await fetch(`${IDP}/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return (await response.json()).token;
}

async function api(method, path, { token, body, form, bearer } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  let payload;
  if (form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${GW}${path}`, { method, headers, body: payload });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

const DEV = "developer@example.test";
const MEMBER = "member@example.test";

/** Setup: the developer's own apps may hold keys and endpoints from earlier runs; the FREE plan allows three keys and one
 *  endpoint. Endpoints and keys from earlier runs are disabled or revoked so the screens have room to work. */
async function freeTheDeveloperPlan(devTok) {
  const apps = (await api("GET", "/api/platform/v1/developer/apps", { token: devTok })).data ?? [];
  let freed = 0;
  for (const app of apps.filter((a) => !a.revokedAt)) {
    const hooks = (await api("GET", `/api/platform/v1/developer/apps/${app.id}/webhooks`, { token: devTok })).data ?? [];
    for (const hook of hooks.filter((h) => !h.disabledAt)) {
      await api("DELETE", `/api/platform/v1/developer/webhooks/${hook.id}`, { token: devTok });
      freed += 1;
    }
    const keys = (await api("GET", `/api/platform/v1/developer/apps/${app.id}/keys`, { token: devTok })).data ?? [];
    for (const key of keys.filter((k) => !k.revokedAt)) {
      await api("DELETE", `/api/platform/v1/developer/keys/${key.id}`, { token: devTok });
      freed += 1;
    }
  }
  return freed;
}

/** Setup for the member: a consent client registered by the member, a request made by that client, and the member's
 *  approval, so a live grant appears in Connected apps. Returns the grant's client name. */
async function makeMemberGrant(memberTok) {
  const registered = await api("POST", "/api/consent/v1/owner/clients", {
    token: memberTok,
    body: {
      name: CLIENT_NAME,
      contactEmail: MEMBER,
      redirectUri: "https://planner.example.test/cb",
      allowedScopes: ["profile.sizes:read"],
    },
  });
  if (registered.status !== 201) throw new Error(`client registration answered ${registered.status}`);
  const clientId = registered.data.client.clientId;
  const clientSecret = registered.data.clientSecret;
  const token = await api("POST", "/api/consent/v1/oauth/token", {
    form: { grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret },
  });
  const clientToken = token.data.access_token;
  const request = await api("POST", "/api/consent/v1/gateway/requests", {
    bearer: clientToken,
    body: { scopes: ["profile.sizes:read"], purpose: "Check your shoe size for a refund claim", durationSeconds: 3600, maxReads: 5 },
  });
  if (request.status !== 201) throw new Error(`consent request answered ${request.status}`);
  const approved = await api("POST", `/api/consent/v1/owner/requests/${request.data.id}/approve`, {
    token: memberTok,
    body: { scopes: ["profile.sizes:read"], durationSeconds: 3600, maxReads: 5 },
  });
  if (approved.status !== 200) throw new Error(`approval answered ${approved.status}`);
  return CLIENT_NAME;
}

/** Signature check, written from the documented rule (platform-service/README.md) and independent of the platform. */
function verifySignature(secret, headers, body) {
  const parts = Object.fromEntries((headers["x-trove-signature"] ?? "").split(",").map((p) => p.split("=")));
  const expected = createHmac("sha256", secret).update(`${parts.t}.${body}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1 ?? "");
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) <= 300;
  return fresh && a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------------------------------------------------
// The browser.

// CHROME_PATH picks a browser build when the Playwright version here expects another revision.
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const contexts = [];
async function newPage({ colorScheme = "light", viewport = { width: 1440, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport, colorScheme });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  return page;
}

const nav = (page) => page.getByRole("navigation", { name: "Workspace" });
const sections = (page) => page.getByRole("navigation", { name: "Developer sections" });

/** Signs in through the dev chooser and waits for the workspace. Below tablet width the sidebar is not in the page until
 *  it is opened, so `narrow` waits for the page heading instead of the navigation. */
async function signInAs(page, label, email, { narrow = false } = {}) {
  await page.goto(`${WS}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.getByRole("button", { name: `Sign in as ${label}, ${email}` }).click();
  const skip = page.getByRole("button", { name: "Skip for now" });
  const ready = narrow ? page.getByRole("heading", { level: 1 }) : nav(page);
  await ready.or(skip).first().waitFor({ state: narrow ? "attached" : "visible" });
  // A first sign-in shows the welcome wizard; let its state settle, then leave it for the workspace.
  await page.waitForLoadState("networkidle");
  if (await skip.isVisible().catch(() => false)) {
    await skip.first().click();
    await page.waitForTimeout(300);
  }
  await ready.first().waitFor({ state: narrow ? "attached" : "visible" });
}

/** The page transition keeps the outgoing page for about 140 ms; wait it out before reading the new one. */
const settle = (page) => page.waitForTimeout(350);

/** A capture of the whole page after the entrance animations have finished. The workspace scrolls inside its own frame,
 *  so the viewport is made tall enough to show the page without scrolling, then put back. */
async function shot(page, name) {
  const size = page.viewportSize();
  await page.setViewportSize({ width: size.width, height: 1800 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  await page.setViewportSize(size);
}

async function noHorizontalScroll(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  return scrollWidth <= clientWidth + 1 ? true : `page is ${scrollWidth}px wide in a ${clientWidth}px window`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Run.

const devTok = await devToken(DEV);
const memberTok = await devToken(MEMBER);
console.log("== Setup (API): free the developer's plan of earlier runs, make a member grant");
const freed = await freeTheDeveloperPlan(devTok);
console.log(`  setup  freed ${freed} endpoint(s) and key(s) left by earlier runs`);
const grantClient = await makeMemberGrant(memberTok);
console.log(`  setup  member consent grant for "${grantClient}" approved`);

const receiverPort = await new Promise((resolve, reject) => {
  const server = createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});
const RECEIVED = join(WORK, `deliveries-${RUN}.jsonl`);
const receiver = spawn("python3", ["-I", join(HERE, "e2e-developer-receiver.py"), String(receiverPort), RECEIVED], {
  stdio: "ignore",
});

const dev = await newPage();
const devMe = (await api("GET", "/api/auth/v1/me", { token: devTok })).data;
const expectedPlanKeys = 3; // the developer persona is on the FREE plan

try {
  console.log("== Developer: overview and apps");
  await signInAs(dev, "Developer", DEV);
  await nav(dev).getByRole("link", { name: "Developer" }).click();
  await check("the developer console opens with the Developer heading", async () => {
    await dev.getByRole("heading", { level: 1, name: "Developer" }).waitFor();
  });
  await check("the overview states the key limit of the developer's plan", async () => {
    await dev.getByRole("img", { name: /^Active keys: \d+ of \d+ used$/ }).waitFor();
    const label = await dev.getByRole("img", { name: /^Active keys:/ }).getAttribute("aria-label");
    return label.endsWith(`of ${expectedPlanKeys} used`) ? undefined : `limit shown: ${label}`;
  });
  await check("no demo label on the live console", async () => {
    return (await dev.getByText("Demo data").count()) === 0 ? undefined : "demo label on a live page";
  });
  await shot(dev, "01-overview-1440-light");

  await sections(dev).getByRole("link", { name: "Apps" }).click();
  await settle(dev);
  await check("the apps page validates a plain http redirect before any request", async () => {
    await dev.getByRole("button", { name: "Register an app" }).click();
    const dialog = dev.getByRole("dialog", { name: "Register an app" });
    await dialog.getByLabel(/^Name/).fill("Plain");
    await dialog.getByLabel("Redirect addresses").fill("http://ui-e2e.example.test/cb");
    await dialog.getByRole("button", { name: "Register app" }).click();
    await dialog.getByText(/Plain http:\/\/ is allowed only/).waitFor();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    return undefined;
  });

  await dev.getByRole("button", { name: "Register an app" }).click();
  const register = dev.getByRole("dialog", { name: "Register an app" });
  await register.getByLabel(/^Name/).fill(APP_NAME);
  await register.getByLabel("Description").fill("Created by the developer console end-to-end check.");
  await register.getByLabel("Redirect addresses").fill("https://ui-e2e.example.test/cb\nhttp://localhost:4321/cb");
  await register.getByRole("button", { name: "Register app" }).click();
  const secretDialog = dev.getByRole("dialog", { name: `Client secret for ${APP_NAME}` });
  let clientSecret = "";
  await check("registering an app shows its client secret once, with the shown-once warning", async () => {
    await secretDialog.waitFor();
    clientSecret = await secretDialog.getByTestId("secret-value").innerText();
    await secretDialog.getByText("Shown once", { exact: true }).waitFor();
    return clientSecret.startsWith("cs_") ? undefined : `secret starts ${clientSecret.slice(0, 4)}`;
  });
  await shot(dev, "02-secret-reveal-1440-light");
  await secretDialog.getByRole("button", { name: "I have copied it" }).click();
  await check("after the secret is closed, the app detail opens", async () => {
    await dev.getByRole("heading", { level: 2, name: APP_NAME }).waitFor();
    return dev.url().match(/\/developer\/apps\/[0-9a-f-]{36}$/) ? undefined : `url ${dev.url()}`;
  });
  const appId = dev.url().split("/").pop();
  const apiApp = await api("GET", `/api/platform/v1/developer/apps/${appId}`, { token: devTok });
  await check("the app exists on the platform with both redirect addresses", async () => {
    return eq(apiApp.data?.redirectUris?.length, 2);
  });
  await check("the platform never returns the client secret again", async () => {
    const list = await api("GET", "/api/platform/v1/developer/apps", { token: devTok });
    return list.data.every((app) => !("clientSecret" in app)) ? undefined : "a secret is listed";
  });

  console.log("== Developer: API keys and the playground");
  await sections(dev).getByRole("link", { name: "API keys" }).click();
  await settle(dev);
  const issue = dev.getByRole("form", { name: "Issue a key" });
  await issue.getByLabel(/^App/).selectOption({ label: APP_NAME });
  await issue.getByLabel(/^Key name/).fill(KEY_NAME);
  await issue.getByRole("checkbox", { name: "usage:read" }).check();
  await issue.getByRole("button", { name: "Issue key" }).click();
  const keyDialog = dev.getByRole("dialog", { name: `Key ${KEY_NAME} is ready` });
  let keyValue = "";
  await check("issuing a key shows the full key once, and the table then shows only its prefix", async () => {
    await keyDialog.waitFor();
    keyValue = await keyDialog.getByTestId("secret-value").innerText();
    await keyDialog.getByRole("button", { name: "I have copied it" }).click();
    const row = dev.getByRole("row").filter({ hasText: KEY_NAME });
    await row.waitFor();
    const text = await row.innerText();
    return /pk_[0-9a-f]{8}…/.test(text) && !text.includes(keyValue) ? undefined : "row shows the full key";
  });
  await check("the key is accepted by the gateway (usage:read), refused outside its scope", async () => {
    const ok = await api("GET", "/api/platform/v1/usage/me", { bearer: keyValue });
    const outside = await api("GET", "/api/platform/v1/developer/apps", { bearer: keyValue });
    if (ok.status !== 200) return `usage answered ${ok.status}`;
    return outside.status === 403 ? undefined : `outside scope answered ${outside.status}`;
  });

  const playgroundAuth = [];
  dev.on("request", (request) => {
    if (request.url().includes("/platform/v1/usage/me")) {
      playgroundAuth.push(request.headers()["authorization"] ?? "");
    }
  });
  await sections(dev).getByRole("link", { name: "Playground" }).click();
  await settle(dev);
  const send = dev.getByRole("form", { name: "Send a request" });
  await send.getByLabel(/^Key\*?$/).selectOption({ label: `${KEY_NAME} (${keyValue.slice(0, 11)}…)` });
  await send.getByLabel(/^Key value/).fill(keyValue);
  await send.getByRole("button", { name: "Send request" }).click();
  await check("the playground sends the request with the key, and shows the gateway's 200", async () => {
    await dev.getByRole("heading", { name: /^Response 200/ }).waitFor();
    const body = await dev.getByLabel("Response body").innerText();
    if (!body.includes("totalRequests")) return "no usage body";
    return playgroundAuth.some((value) => value === `Bearer ${keyValue}`)
      ? undefined
      : `no request carried the key; saw ${playgroundAuth.join(", ")}`;
  });
  await check("the playground never sends the signed-in user's token", async () => {
    return playgroundAuth.some((value) => value.startsWith("Bearer pk_")) ? undefined : "no key request seen";
  });
  await send.getByLabel(/^Path/).fill("/platform/v1/developer/apps");
  await send.getByRole("button", { name: "Send request" }).click();
  await check("the playground refuses a route no key may call, in the gateway's words", async () => {
    await send.getByText("API keys cannot call this route. Only the routes listed for keys are open to them.").waitFor();
    return undefined;
  });
  await shot(dev, "03-playground-1440-light");

  console.log("== Developer: webhooks, delivery, replay");
  await sections(dev).getByRole("link", { name: "Webhooks" }).click();
  await settle(dev);
  const hookForm = dev.getByRole("form", { name: "Add an endpoint" });
  await hookForm.getByLabel(/^App/).selectOption({ label: APP_NAME });
  await hookForm.getByLabel(/^Address/).fill("http://hooks.example.test/plain");
  await hookForm.getByRole("checkbox", { name: HOOK_NAME }).check();
  await hookForm.getByRole("button", { name: "Add endpoint" }).click();
  await check("a plain http address to a public host is refused on the form", async () => {
    await hookForm.getByText(/Plain http:\/\/ is allowed only/).waitFor();
    return undefined;
  });
  const hookUrl = `http://127.0.0.1:${receiverPort}/hook`;
  await hookForm.getByLabel(/^Address/).fill(hookUrl);
  await hookForm.getByRole("button", { name: "Add endpoint" }).click();
  const hookDialog = dev.getByRole("dialog", { name: `Signing secret for ${hookUrl}` });
  let signingSecret = "";
  await check("adding an endpoint shows its signing secret once", async () => {
    await hookDialog.waitFor();
    signingSecret = await hookDialog.getByTestId("secret-value").innerText();
    await shot(dev, "04-signing-secret-1440-light");
    await hookDialog.getByRole("button", { name: "I have copied it" }).click();
    return signingSecret.startsWith("whsec_") ? undefined : `secret starts ${signingSecret.slice(0, 6)}`;
  });

  // A domain event, published the way a product service would (the same shape as dev/e2e-developer.sh).
  const eventId = randomUUID();
  const event = JSON.stringify({
    eventId,
    type: HOOK_NAME,
    occurredAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    ownerUid: devMe.id,
    data: { title: "Renew passport", reminderId: `ui-${RUN}` },
  });
  await new Promise((resolve, reject) => {
    const child = execFile(
      "docker",
      ["exec", "-i", KAFKA_CONTAINER, "/opt/kafka/bin/kafka-console-producer.sh", "--bootstrap-server", "localhost:9092", "--topic", "platform.domain.events.v1"],
      { env: { ...process.env, DOCKER_HOST: process.env.DOCKER_HOST || `unix://${process.env.HOME}/.colima/default/docker.sock` } },
      (error) => (error ? reject(error) : resolve()),
    );
    child.stdin.end(`${event}\n`);
  });

  await sections(dev).getByRole("link", { name: "Webhooks" }).click();
  await settle(dev);
  await dev.getByLabel("Endpoint", { exact: true }).selectOption({ label: hookUrl });
  await check("the delivery shows as Delivered in the log, with the event type", async () => {
    await dev.locator("section[aria-labelledby='delivery-log'] td", { hasText: HOOK_NAME }).first().waitFor({ timeout: 60_000 });
    await dev.locator("section[aria-labelledby='delivery-log'] td", { hasText: "Delivered" }).first().waitFor({ timeout: 60_000 });
    return undefined;
  });
  await check("the receiver got the signed delivery, and the signature verifies with the endpoint secret", async () => {
    for (let i = 0; i < 60 && !(existsSync(RECEIVED) && readFileSync(RECEIVED, "utf8").trim()); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const first = JSON.parse(readFileSync(RECEIVED, "utf8").split("\n")[0]);
    if (first.headers["x-trove-event-id"] !== eventId) return "event id header does not match the event";
    return verifySignature(signingSecret, first.headers, first.body) ? undefined : "signature does not verify";
  });
  await shot(dev, "05-webhooks-delivered-1440-light");

  await check("replaying the delivery sends it to the receiver again", async () => {
    await dev.getByRole("button", { name: `Replay ${HOOK_NAME}` }).first().click();
    await dev.getByText(/Replaying reminder.created/).waitFor();
    for (let i = 0; i < 60; i += 1) {
      const lines = readFileSync(RECEIVED, "utf8").trim().split("\n").length;
      if (lines >= 2) return undefined;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return "the receiver got no second delivery";
  });

  console.log("== Developer: API docs, mobile width, dark mode");
  await sections(dev).getByRole("link", { name: "API docs" }).click();
  await settle(dev);
  await check("the docs index says only the platform document is published", async () => {
    const list = dev.getByRole("list", { name: "API documents" });
    await list.getByText("platform").waitFor();
    const notYet = await list.getByText("Not published yet").count();
    return notYet === 8 ? undefined : `${notYet} services marked not published`;
  });
  await shot(dev, "06-docs-1440-light");

  await sections(dev).getByRole("link", { name: "API keys" }).click();
  await settle(dev);
  await check("revoking a key asks first, then shows it revoked", async () => {
    const row = dev.getByRole("row").filter({ hasText: KEY_NAME });
    await row.getByRole("button", { name: `Revoke ${KEY_NAME}` }).click();
    const confirm = dev.getByRole("dialog", { name: `Revoke ${KEY_NAME}?` });
    await confirm.getByText(/about a minute/).waitFor();
    await confirm.getByRole("button", { name: "Revoke key" }).click();
    await row.getByText("Revoked").waitFor();
    return undefined;
  });
  await check("the revoked key is refused by the gateway after the exchange cache expires", async () => {
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    const after = await api("GET", "/api/platform/v1/usage/me", { bearer: keyValue });
    return after.status === 401 ? undefined : `answered ${after.status}`;
  });

  const mobile = await newPage({ viewport: { width: 390, height: 844 } });
  await signInAs(mobile, "Developer", DEV, { narrow: true });
  await mobile.goto(`${WS}/developer/keys`, { waitUntil: "networkidle" });
  await check("the keys page has no horizontal scroll at 390 px", async () => noHorizontalScroll(mobile));
  await shot(mobile, "07-keys-390-light");
  await mobile.goto(`${WS}/developer`, { waitUntil: "networkidle" });
  await check("the overview has no horizontal scroll at 390 px", async () => noHorizontalScroll(mobile));
  await shot(mobile, "10-overview-390-light");
  const dark = await newPage({ colorScheme: "dark" });
  await signInAs(dark, "Developer", DEV);
  await dark.goto(`${WS}/developer/webhooks`, { waitUntil: "networkidle" });
  await dark.getByRole("heading", { level: 1, name: "Developer" }).waitFor();
  await shot(dark, "08-webhooks-1440-dark");
  await dark.goto(`${WS}/developer`, { waitUntil: "networkidle" });
  await dark.getByRole("heading", { level: 1, name: "Developer" }).waitFor();
  await shot(dark, "11-overview-1440-dark");

  console.log("== Member: Connected apps and access");
  const member = await newPage();
  await signInAs(member, "Member", MEMBER);
  await check("a member is refused the developer console, with the missing permission named", async () => {
    await member.goto(`${WS}/developer`, { waitUntil: "networkidle" });
    const forbidden = member.getByTestId("forbidden");
    await forbidden.getByRole("heading", { name: "Developer is not part of your role" }).waitFor();
    await forbidden.getByText("apps:manage").waitFor();
    return undefined;
  });
  await member.goto(`${WS}/account`, { waitUntil: "networkidle" });
  await check("the member sees the granted app under Connected apps, with its scope", async () => {
    const list = member.getByRole("list", { name: "Apps with access to your data" });
    await list.getByText(grantClient, { exact: true }).waitFor();
    await list.getByRole("listitem").filter({ hasText: grantClient }).getByText("profile.sizes:read").waitFor();
    return undefined;
  });
  await shot(member, "09-connected-apps-1440-light");
  await check("the member disconnects the app after confirming, and the grant is revoked on the platform", async () => {
    const list = member.getByRole("list", { name: "Apps with access to your data" });
    await list.getByRole("button", { name: `Disconnect ${grantClient}` }).click();
    const confirm = member.getByRole("dialog", { name: `Disconnect ${grantClient}?` });
    await confirm.getByRole("button", { name: "Disconnect" }).click();
    // Older grants from earlier runs may remain, so the check is that this grant has left the list.
    await list.getByText(grantClient, { exact: true }).waitFor({ state: "detached" });
    // The status is computed on read from revokedAt, so a read in the same instant can still say ACTIVE: poll briefly.
    let status;
    for (let i = 0; i < 20; i += 1) {
      const grants = await api("GET", "/api/consent/v1/owner/grants?includeInactive=true", { token: memberTok });
      status = grants.data.find((g) => g.clientName === grantClient)?.status;
      if (status === "REVOKED") return undefined;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return `grant status ${status}`;
  });
} finally {
  receiver.kill();
  await browser.close();
}

console.log(`\npassed: ${pass}   failed: ${fail}`);
console.log(`screenshots: ${SHOTS}`);
process.exit(fail === 0 ? 0 : 1);
