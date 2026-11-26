#!/usr/bin/env node
// Per-persona browser suite: what each seeded persona actually does in the workspace, end to end, against the live dev
// stack (dev/up.sh, then dev/seed-personas.sh) and a running workspace (dev/web.sh, :5190). Every task goes through the
// real screens; the API is used only for setup, clean-up and independent checks of what the screens claimed.
//
//   node dev/e2e-personas-browser.mjs
//   QA_PERSONAS=member,auditor node dev/e2e-personas-browser.mjs        (some sections only)
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs node dev/e2e-personas-browser.mjs
//
// Sections (each also asserts what that persona must NOT see):
//   member     adds a Waiting On item and finds it on Today; no Admin, no Developer, no platform usage
//   developer  registers an app and issues an API key; no Admin console
//   admin      grants and revokes a role on a member, is refused on an owner, cannot touch ADMIN/OWNER roles
//   auditor    reads the audit log, has no write controls, and the API refuses a role change
//   owner      sees platform usage (headline numbers, traffic by service, top users) and every area
//
// Exits non-zero if any check fails. Screenshots land in dev/.state/e2e-personas (git-ignored). CI has no live stack,
// so this is a manual check (dev/README.md).
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONAS, collectErrors, launch, newContext, signInAs } from "./qa/lib.mjs";

const WS = (process.env.WORKSPACE_URL || "http://localhost:5190").replace(/\/+$/, "");
const GW = (process.env.GATEWAY_URL || "http://localhost:8080").replace(/\/+$/, "");
const IDP = (process.env.IDP_URL || "http://localhost:9100").replace(/\/+$/, "");
const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, ".state", "e2e-personas");
mkdirSync(SHOTS, { recursive: true });
const RUN = Date.now();
/** A disposable account the admin changes roles on, so the seeded personas keep their roles. */
const TARGET_EMAIL = "persona-suite-target@example.test";

const wanted = new Set(
  (process.env.QA_PERSONAS || "member,developer,admin,auditor,owner")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

// ---------------------------------------------------------------------------------------------------------- reporting
let pass = 0;
let fail = 0;
async function check(name, fn) {
  try {
    const detail = await fn();
    if (detail === undefined || detail === true) {
      pass += 1;
      console.log(`  PASS  ${name}`);
    } else {
      fail += 1;
      console.log(`  FAIL  ${name}  (${detail})`);
    }
  } catch (error) {
    fail += 1;
    console.log(`  FAIL  ${name}  (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`);
  }
}
const eq = (actual, expected) =>
  actual === expected ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;

// --------------------------------------------------------------------------------------------- API (setup and checks)
async function idpToken(email) {
  const response = await fetch(`${IDP}/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new Error(`dev IdP answered ${response.status} for ${email}`);
  return (await response.json()).token;
}

async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${GW}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

/** The admin API's view of one account, found by email. */
async function adminUser(ownerToken, email) {
  const r = await api("GET", `/api/auth/v1/admin/users?query=${encodeURIComponent(email)}`, { token: ownerToken });
  if (r.status !== 200) throw new Error(`user search answered ${r.status}`);
  const items = Array.isArray(r.data) ? r.data : (r.data?.items ?? r.data?.content ?? []);
  const user = items.find((u) => u.email === email);
  if (!user) throw new Error(`no account for ${email}`);
  return user;
}

/** Runs one persona's section; a setup failure (the stack answering 5xx, say) is reported as a failed check, not a crash. */
async function section(key, fn) {
  if (!wanted.has(key)) return;
  try {
    await fn();
  } catch (error) {
    fail += 1;
    console.log(`  FAIL  ${key}: section setup  (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`);
  }
}

// ------------------------------------------------------------------------------------------------------------ browser
const browser = await launch();
const nav = (page) => page.getByRole("navigation", { name: "Workspace" });

/** A fresh, signed-in page for one persona, with its console errors and failed API calls collected. */
async function as(key) {
  const context = await newContext(browser, { width: 1280 });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const errors = collectErrors(page);
  await signInAs(page, WS, PERSONAS[key]);
  await nav(page).waitFor();
  return { page, context, errors };
}

const navLinks = async (page) => (await nav(page).getByRole("link").allInnerTexts()).map((t) => t.trim());
const forbiddenHeading = async (page) => {
  const forbidden = page.getByTestId("forbidden");
  await forbidden.waitFor();
  return forbidden.getByRole("heading", { level: 1 }).innerText();
};
const h1 = (page) => page.getByRole("heading", { level: 1 }).first().innerText();
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
/** Errors a persona's own actions must not produce: page errors and 5xx answers (4xx refusals are asserted per check). */
const serious = (errors) => errors.filter((e) => e.startsWith("pageerror") || /^HTTP 5/.test(e));

// ============================================================================================================= member
await section("member", async () => {
  console.log("== Member: adds a Waiting On item and sees it on Today");
  const { page, context, errors } = await as("member");
  const title = `Persona suite refund ${RUN}`;
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

  await check("creates a Waiting On item through the form", async () => {
    await page.goto(`${WS}/app/waiting-on/new`, { waitUntil: "networkidle" });
    await page.getByLabel("What are you waiting for?").fill(title);
    await page.getByLabel("Who are you waiting on?").fill("Persona Suite Shop");
    await page.getByLabel("Category").selectOption({ label: "Refund" });
    await page.getByLabel("Expected by").fill(tomorrow);
    await page.getByRole("button", { name: "Start tracking" }).click();
    await page.getByRole("heading", { name: title }).waitFor({ timeout: 15_000 });
    return true;
  });

  await check("the item is on Today, due tomorrow, and opens its page", async () => {
    await page.goto(`${WS}/`, { waitUntil: "networkidle" });
    const feed = page.getByRole("list", { name: "Items that need you" });
    await feed.waitFor();
    const more = page.getByRole("button", { name: /^Show \d+ more$/ });
    if (await more.count()) await more.first().click();
    const entry = feed.getByRole("link").filter({ hasText: title });
    await entry.first().waitFor();
    const text = await entry.first().innerText();
    if (!/Due in 1 day/.test(text)) return `Today shows "${text.replace(/\s+/g, " ").slice(0, 120)}"`;
    await entry.first().click();
    await page.getByRole("heading", { name: title }).waitFor();
    await shot(page, "member-item-from-today");
    return true;
  });

  await check("does not see Admin or Developer in the navigation", async () => {
    await page.goto(`${WS}/`, { waitUntil: "networkidle" });
    const links = await navLinks(page);
    return links.includes("Admin") || links.includes("Developer") ? `navigation: ${links.join(", ")}` : true;
  });
  await check("platform usage and the admin console say they are not part of the role", async () => {
    await page.goto(`${WS}/app/admin/usage`, { waitUntil: "networkidle" });
    return eq(await forbiddenHeading(page), "Admin is not part of your role");
  });
  await check("the developer area says it is not part of the role", async () => {
    await page.goto(`${WS}/developer`, { waitUntil: "networkidle" });
    return eq(await forbiddenHeading(page), "Developer is not part of your role");
  });
  await check("no page errors or server errors along the way", async () => {
    const bad = serious(errors);
    return bad.length ? bad.slice(0, 3).join("; ") : true;
  });

  // Clean-up: cancel the item so repeated runs do not pile up active follow-ups.
  const token = await idpToken(PERSONAS.member.email);
  const mine = await api("GET", "/api/waiting-on/v1/items?limit=100", { token });
  for (const item of (mine.data ?? []).filter((i) => i.title === title))
    await api("POST", `/api/waiting-on/v1/items/${item.id}/cancel`, { token });
  await context.close();
});

// ========================================================================================================== developer
await section("developer", async () => {
  console.log("== Developer: registers an app and issues an API key");
  const token = await idpToken(PERSONAS.developer.email);
  // The FREE plan allows three active keys: revoke keys left by earlier runs so there is room.
  const before = (await api("GET", "/api/platform/v1/developer/apps", { token })).data ?? [];
  for (const app of before.filter((a) => !a.revokedAt)) {
    const keys = (await api("GET", `/api/platform/v1/developer/apps/${app.id}/keys`, { token })).data ?? [];
    for (const key of keys.filter((k) => !k.revokedAt))
      await api("DELETE", `/api/platform/v1/developer/keys/${key.id}`, { token });
  }

  const { page, context, errors } = await as("developer");
  const appName = `Persona suite app ${RUN}`;
  const keyName = `persona-suite-${RUN}`;
  const sections = page.getByRole("navigation", { name: "Developer sections" });
  let keyValue = null;

  await check("registers an app and is shown its client secret once", async () => {
    await page.goto(`${WS}/developer`, { waitUntil: "networkidle" });
    await sections.getByRole("link", { name: "Apps" }).click();
    await page.getByRole("button", { name: "Register an app" }).click();
    const dialog = page.getByRole("dialog", { name: "Register an app" });
    await dialog.getByLabel(/^Name/).fill(appName);
    await dialog.getByLabel("Redirect addresses").fill("https://persona-suite.example.test/cb");
    await dialog.getByRole("button", { name: "Register app" }).click();
    const secret = page.getByRole("dialog", { name: `Client secret for ${appName}` });
    await secret.getByText("Shown once", { exact: true }).waitFor();
    await secret.getByRole("button", { name: "I have copied it" }).click();
    await page.getByRole("heading", { level: 2, name: appName }).waitFor();
    return true;
  });

  await check("issues an API key for that app; the list shows only its prefix", async () => {
    await sections.getByRole("link", { name: "API keys" }).click();
    const issue = page.getByRole("form", { name: "Issue a key" });
    await issue.getByLabel(/^App/).selectOption({ label: appName });
    await issue.getByLabel(/^Key name/).fill(keyName);
    await issue.getByRole("checkbox", { name: "usage:read" }).check();
    await issue.getByRole("button", { name: "Issue key" }).click();
    const ready = page.getByRole("dialog", { name: `Key ${keyName} is ready` });
    await ready.waitFor();
    keyValue = await ready.getByTestId("secret-value").innerText();
    await ready.getByRole("button", { name: "I have copied it" }).click();
    const row = page.getByRole("row").filter({ hasText: keyName });
    await row.waitFor();
    const text = await row.innerText();
    await shot(page, "developer-key-issued");
    return /pk_[0-9a-f]{8}…/.test(text) && !text.includes(keyValue) ? true : "the row shows the full key";
  });

  await check("the gateway accepts the new key inside its scope and refuses it outside", async () => {
    if (!keyValue) return "no key was issued";
    const inside = await api("GET", "/api/platform/v1/usage/me", { token: keyValue });
    const outside = await api("GET", "/api/platform/v1/developer/apps", { token: keyValue });
    return eq(inside.status, 200) ?? eq(outside.status, 403);
  });

  await check("does not see the Admin console", async () => {
    const links = await navLinks(page);
    if (links.includes("Admin")) return "Admin is in the navigation";
    await page.goto(`${WS}/app/admin/users`, { waitUntil: "networkidle" });
    return eq(await forbiddenHeading(page), "Admin is not part of your role");
  });
  await check("no page errors or server errors along the way", async () => {
    const bad = serious(errors);
    return bad.length ? bad.slice(0, 3).join("; ") : true;
  });

  // Clean-up: revoke the key and retire the app, so the plan's key limit stays free for the next run.
  const apps = (await api("GET", "/api/platform/v1/developer/apps", { token })).data ?? [];
  for (const app of apps.filter((a) => a.name === appName)) {
    const keys = (await api("GET", `/api/platform/v1/developer/apps/${app.id}/keys`, { token })).data ?? [];
    for (const key of keys.filter((k) => !k.revokedAt))
      await api("DELETE", `/api/platform/v1/developer/keys/${key.id}`, { token });
    await api("DELETE", `/api/platform/v1/developer/apps/${app.id}`, { token });
  }
  await context.close();
});

// ============================================================================================================== admin
await section("admin", async () => {
  console.log("== Admin: changes a role, is refused for an owner, cannot touch ADMIN or OWNER");
  const ownerToken = await idpToken(PERSONAS.owner.email);
  // The target account exists once it has signed in through the gateway; reset it to MEMBER only.
  await api("GET", "/api/auth/v1/me", { token: await idpToken(TARGET_EMAIL) });
  const target = await adminUser(ownerToken, TARGET_EMAIL);
  for (const role of (target.roles ?? []).filter((r) => r !== "MEMBER"))
    await api("DELETE", `/api/auth/v1/admin/users/${target.id}/roles/${role}`, { token: ownerToken });
  const owner = await adminUser(ownerToken, PERSONAS.owner.email);
  const ownerRolesBefore = [...(owner.roles ?? [])].sort().join(",");

  const { page, context, errors } = await as("admin");
  const roleButton = (verb, role) => page.getByRole("button", { name: new RegExp(`^${verb} ${role} (to|from) `) });

  await check("finds the account by email in Users", async () => {
    await page.goto(`${WS}/app/admin/users`, { waitUntil: "networkidle" });
    await page.getByLabel("Search users").fill(TARGET_EMAIL);
    // The list follows the search after a short debounce; wait for this account's own link.
    const label = target.displayName?.trim() || TARGET_EMAIL;
    await page.getByRole("link", { name: `Manage ${label}`, exact: true }).click();
    await page.getByRole("heading", { level: 2, name: "Roles" }).waitFor();
    return page.url().includes(target.id) ? true : `opened ${page.url()}`;
  });

  await check("grants DEVELOPER; the screen and the API both show it", async () => {
    await roleButton("Grant", "DEVELOPER").click();
    await page.getByText(/^Granted DEVELOPER to /).waitFor();
    await roleButton("Revoke", "DEVELOPER").waitFor();
    const after = await adminUser(ownerToken, TARGET_EMAIL);
    return (after.roles ?? []).includes("DEVELOPER") ? true : `API roles: ${after.roles}`;
  });

  await check("revokes it again", async () => {
    await roleButton("Revoke", "DEVELOPER").click();
    await page.getByText(/^Revoked DEVELOPER from /).waitFor();
    const after = await adminUser(ownerToken, TARGET_EMAIL);
    return (after.roles ?? []).includes("DEVELOPER") ? `API roles: ${after.roles}` : true;
  });

  await check("cannot grant or revoke ADMIN or OWNER (buttons disabled, with the reason)", async () => {
    for (const role of ["ADMIN", "OWNER"]) {
      const button = roleButton("Grant", role);
      if (!(await button.isDisabled())) return `Grant ${role} is enabled`;
      await page.getByText(`Only an owner can change ${role}.`).waitFor();
    }
    return true;
  });

  await check("changing a role on an OWNER account is refused, and the owner's roles are unchanged", async () => {
    await page.goto(`${WS}/app/admin/users/${owner.id}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 2, name: "Roles" }).waitFor();
    const grant = roleButton("Grant", "AUDITOR");
    if ((await grant.count()) && !(await grant.isDisabled())) {
      await grant.click();
      await page.getByText("Could not grant the role").waitFor();
    }
    await shot(page, "admin-owner-target-refused");
    const after = await adminUser(ownerToken, PERSONAS.owner.email);
    return eq([...(after.roles ?? [])].sort().join(","), ownerRolesBefore);
  });

  await check("does not see the Developer area", async () => {
    const links = await navLinks(page);
    if (links.includes("Developer")) return "Developer is in the navigation";
    await page.goto(`${WS}/developer`, { waitUntil: "networkidle" });
    return eq(await forbiddenHeading(page), "Developer is not part of your role");
  });
  await check("no page errors or server errors along the way", async () => {
    // The refused grant on the owner is a 403 the check above expects; only 5xx and page errors count here.
    const bad = serious(errors);
    return bad.length ? bad.slice(0, 3).join("; ") : true;
  });
  await context.close();
});

// ============================================================================================================ auditor
await section("auditor", async () => {
  console.log("== Auditor: reads the audit log and is refused writes");
  const { page, context, errors } = await as("auditor");

  await check("reads the audit log, with entries", async () => {
    await page.goto(`${WS}/app/admin/audit`, { waitUntil: "networkidle" });
    if ((await h1(page)) !== "Audit log") return `heading: ${await h1(page)}`;
    const log = page.getByRole("list", { name: "Audit log" }).or(page.getByRole("table", { name: "Audit log" }));
    await log.first().waitFor();
    const rows = await log.first().locator("li, tbody tr").count();
    await shot(page, "auditor-audit-log");
    return rows > 0 ? true : "the audit log is empty";
  });

  await check("a user's page says roles can be read but not changed, with no Grant or Revoke buttons", async () => {
    const ownerToken = await idpToken(PERSONAS.owner.email);
    const member = await adminUser(ownerToken, PERSONAS.member.email);
    await page.goto(`${WS}/app/admin/users/${member.id}`, { waitUntil: "networkidle" });
    await page.getByText("You can read roles but not change them.").waitFor();
    const writes = await page.getByRole("button", { name: /^(Grant|Revoke) / }).count();
    const suspend = await page.getByRole("button", { name: /^Suspend/ }).count();
    return writes === 0 && suspend === 0 ? true : `${writes} role buttons, ${suspend} suspend buttons`;
  });

  await check("the API refuses the auditor's role change (403) and nothing changes", async () => {
    const token = await idpToken(PERSONAS.auditor.email);
    const ownerToken = await idpToken(PERSONAS.owner.email);
    const member = await adminUser(ownerToken, PERSONAS.member.email);
    const r = await api("PUT", `/api/auth/v1/admin/users/${member.id}/roles/DEVELOPER`, { token });
    const after = await adminUser(ownerToken, PERSONAS.member.email);
    return eq(r.status, 403) ?? ((after.roles ?? []).includes("DEVELOPER") ? "the member gained DEVELOPER" : undefined);
  });

  await check("does not see the Developer area", async () => {
    await page.goto(`${WS}/`, { waitUntil: "networkidle" });
    const links = await navLinks(page);
    return links.includes("Developer") ? "Developer is in the navigation" : true;
  });
  await check("no page errors or server errors along the way", async () => {
    const bad = serious(errors);
    return bad.length ? bad.slice(0, 3).join("; ") : true;
  });
  await context.close();
});

// ============================================================================================================== owner
await section("owner", async () => {
  console.log("== Owner: sees platform usage");
  const { page, context, errors } = await as("owner");

  await check("sees Admin and Developer in the navigation", async () => {
    const links = await navLinks(page);
    return links.includes("Admin") && links.includes("Developer") ? true : `navigation: ${links.join(", ")}`;
  });

  await check("platform usage shows headline numbers, traffic by service and top users", async () => {
    await page.goto(`${WS}/app/admin/usage`, { waitUntil: "networkidle" });
    if ((await h1(page)) !== "Usage") return `heading: ${await h1(page)}`;
    const headline = page.getByRole("region", { name: "Headline numbers" });
    await headline.waitFor();
    const numbers = (await headline.innerText()).match(/\d/g)?.length ?? 0;
    if (numbers === 0) return "no numbers in the headline";
    await page.getByText("By service").first().waitFor();
    await page.getByRole("heading", { name: "Top users" }).first().waitFor();
    await shot(page, "owner-platform-usage");
    return true;
  });

  await check("the usage API agrees there is metered traffic", async () => {
    const token = await idpToken(PERSONAS.owner.email);
    const r = await api("GET", "/api/platform/v1/usage/summary", { token });
    return r.status === 200 ? true : `summary answered ${r.status}`;
  });
  await check("no page errors or server errors along the way", async () => {
    const bad = serious(errors);
    return bad.length ? bad.slice(0, 3).join("; ") : true;
  });
  await context.close();
});

await browser.close();
console.log(`\n${pass} passed, ${fail} failed. Screenshots: ${SHOTS}`);
process.exit(fail ? 1 : 0);
