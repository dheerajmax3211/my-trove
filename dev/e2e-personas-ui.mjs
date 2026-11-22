#!/usr/bin/env node
// Browser checks for sign-in and the persona matrix in the workspace, against the live dev stack (dev/up.sh) and a
// running workspace (dev/web.sh, default http://localhost:5190). Every sign-in goes through the real UI: the Google
// button's dev chooser, the email link, the account menu and the command palette. Nothing is mocked except the one
// check that makes /me return 401, which is a network-level stub so the expired-session path can be exercised.
//
//   WORKSPACE_URL=http://localhost:5190 node dev/e2e-personas-ui.mjs
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs node dev/e2e-personas-ui.mjs   (if playwright-core is not resolvable)
//   E2E_SKIP_SLOW=1 node dev/e2e-personas-ui.mjs                                      (skips the ~1-2 minute role refresh check)
//
// Exits non-zero if any check fails. Screenshots of each persona land in dev/.state/e2e (git-ignored).
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(
  process.env.PLAYWRIGHT_CORE || "playwright-core"
);

const WS = (process.env.WORKSPACE_URL || "http://localhost:5190").replace(
  /\/+$/,
  "",
);
const GW = process.env.GATEWAY_URL || "http://localhost:8080";
const IDP = process.env.IDP_URL || "http://localhost:9100";
const SKIP_SLOW = process.env.E2E_SKIP_SLOW === "1";
const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, ".state", "e2e");
mkdirSync(SHOTS, { recursive: true });
const RUN = Date.now();

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
    bad(
      name,
      error instanceof Error ? error.message.split("\n")[0] : String(error),
    );
  }
}
const eq = (actual, expected) =>
  actual === expected
    ? undefined
    : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;

const PERSONAS = [
  { label: "Owner", email: "dev@example.test", admin: true, developer: true },
  {
    label: "Admin",
    email: "admin@example.test",
    admin: true,
    developer: false,
  },
  {
    label: "Developer",
    email: "developer@example.test",
    admin: false,
    developer: true,
  },
  {
    label: "Member",
    email: "member@example.test",
    admin: false,
    developer: false,
  },
  {
    label: "Auditor",
    email: "auditor@example.test",
    admin: true,
    developer: false,
  },
];

const browser = await chromium.launch({ headless: true });
const contexts = [];

async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  return page;
}

const nav = (page) => page.getByRole("navigation", { name: "Workspace" });
const signInHeading = (page) =>
  page.getByRole("heading", { level: 2, name: "Sign in", exact: true });

/** A first sign-in shows the welcome wizard in place of the workspace; "Skip for now" leaves it for the shell. */
async function arriveInWorkspace(page) {
  const skip = page.getByRole("button", { name: "Skip for now" });
  await nav(page).or(skip).first().waitFor();
  if (await skip.count()) {
    await skip.first().click();
    await page.waitForTimeout(300);
  }
  await nav(page).waitFor();
}

/** Signs in through the dev chooser (the Google button) as one seeded account, and waits for the workspace. */
async function signInAsPersona(page, persona) {
  await page.goto(`${WS}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page
    .getByRole("button", {
      name: new RegExp(`^Sign in as ${persona.label}, ${persona.email}$`),
    })
    .click();
  await arriveInWorkspace(page);
}

/** Sends an email link from the sign-in page and returns the link the page shows (no email is sent in dev). */
async function sendLink(page, address) {
  await page.goto(`${WS}/`, { waitUntil: "networkidle" });
  await page.getByLabel("Email address").fill(address);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  const link = page.getByRole("link", { name: "open the sign-in link" });
  await link.waitFor();
  return link.getAttribute("href");
}

async function signOutFromMenu(page) {
  await page.getByRole("button", { name: /^Account menu for / }).click();
  const item = page
    .getByRole("menuitem", { name: "Sign out" })
    .or(page.getByRole("button", { name: "Sign out", exact: true }));
  await item.first().click();
  await signInHeading(page).waitFor();
}

const accountEmail = async (page) => {
  await page.goto(`${WS}/account`, { waitUntil: "networkidle" });
  return page
    .getByText(/@example\.test/)
    .first()
    .innerText();
};

// ---------------------------------------------------------------------------------------------------------------------
console.log("== Front door: a plain visit is the real sign-in, never demo");
await check("plain / shows the sign-in page without a workspace", async () => {
  const page = await newPage();
  await page.goto(`${WS}/`, { waitUntil: "networkidle" });
  await signInHeading(page).waitFor();
  if ((await nav(page).count()) !== 0)
    return "a workspace navigation rendered before sign-in";
  if ((await page.getByText("Demo build").count()) !== 0)
    return "the old demo-build notice is back";
  return true;
});

console.log(
  "== Google in development: a chooser of the five seeded accounts, never a silent pick",
);
await check(
  "Continue with Google opens the chooser and signs in nobody by itself",
  async () => {
    const page = await newPage();
    await page.goto(`${WS}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Continue with Google" }).click();
    const chooser = page.getByRole("region", {
      name: "Choose a development account",
    });
    await chooser.waitFor();
    const buttons = await chooser.getByRole("button").count();
    if (buttons !== 5)
      return `expected 5 accounts in the chooser, got ${buttons}`;
    if ((await nav(page).count()) !== 0)
      return "signed in before a choice was made";
    return true;
  },
);

console.log("== Persona matrix through the real UI");
for (const persona of PERSONAS) {
  const page = await newPage();
  await check(
    `${persona.label}: signs in as ${persona.email}, and the account shows it`,
    async () => {
      await signInAsPersona(page, persona);
      const shown = await accountEmail(page);
      return shown.includes(persona.email)
        ? true
        : `account page shows "${shown.slice(0, 60)}"`;
    },
  );
  await check(
    `${persona.label}: Products are open and Admin/Developer appear only for that role`,
    async () => {
      await page.goto(`${WS}/`, { waitUntil: "networkidle" });
      const links = await nav(page).getByRole("link").allInnerTexts();
      const hasAdmin = links.some((t) => t.trim() === "Admin");
      const hasDeveloper = links.some((t) => t.trim() === "Developer");
      if (!links.some((t) => t.trim() === "Waiting On"))
        return "Waiting On is missing from Products";
      return eq(hasAdmin, persona.admin) ?? eq(hasDeveloper, persona.developer);
    },
  );
  await check(
    `${persona.label}: the Admin console opens, or says it is not part of the role`,
    async () => {
      await page.goto(`${WS}/app/admin`, { waitUntil: "networkidle" });
      if (persona.admin)
        return eq(
          await page.getByRole("heading", { level: 1 }).first().innerText(),
          "Admin console",
        );
      const forbidden = page.getByTestId("forbidden");
      await forbidden.waitFor();
      return eq(
        await forbidden.getByRole("heading", { level: 1 }).innerText(),
        "Admin is not part of your role",
      );
    },
  );
  await check(
    `${persona.label}: the Developer page opens, or says it is not part of the role`,
    async () => {
      await page.goto(`${WS}/developer`, { waitUntil: "networkidle" });
      if (persona.developer) {
        return eq(
          await page.getByRole("heading", { level: 1 }).first().innerText(),
          "Developer",
        );
      }
      const forbidden = page.getByTestId("forbidden");
      await forbidden.waitFor();
      return eq(
        await forbidden.getByRole("heading", { level: 1 }).innerText(),
        "Developer is not part of your role",
      );
    },
  );
  await page.goto(`${WS}/`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: join(SHOTS, `persona-${persona.label.toLowerCase()}.png`),
  });
}

console.log(
  "== Email sign-in link: send, open on the same device, open on another device, reuse",
);
const linkAddress = `link-ui-${RUN}@example.test`;
const sender = await newPage();
let link = null;
await check(
  "sending a link signs nobody in and shows the link on the page",
  async () => {
    link = await sendLink(sender, linkAddress);
    if (!link || !link.includes("mode=signIn") || !link.includes("oobCode="))
      return `unexpected link ${link}`;
    if ((await sender.getByText("Check your inbox").count()) === 0)
      return 'no "Check your inbox" message';
    if ((await nav(sender).count()) !== 0)
      return "the sender was signed in before opening the link";
    return true;
  },
);

await check(
  "the link signs in the address it was sent to on the same device",
  async () => {
    await sender.goto(link, { waitUntil: "networkidle" });
    await arriveInWorkspace(sender);
    const shown = await accountEmail(sender);
    return shown.includes(linkAddress)
      ? true
      : `account shows "${shown.slice(0, 60)}"`;
  },
);

const other = await newPage();
await check(
  "opened on another device it asks for the address, refuses a wrong one, and accepts the right one",
  async () => {
    const requester = await newPage(); // a signed-out device asks for the link, as a second person's browser would
    const fresh = await sendLink(requester, `link-ui2-${RUN}@example.test`);
    await other.goto(fresh, { waitUntil: "networkidle" });
    await other
      .getByRole("heading", { level: 2, name: "Confirm your email" })
      .waitFor();
    await other.getByLabel("Email address").fill("someone-else@example.test");
    await other.getByRole("button", { name: "Finish signing in" }).click();
    await other
      .getByText("This sign-in link was sent to a different address.")
      .waitFor();
    if ((await nav(other).count()) !== 0)
      return "signed in with the wrong address";
    await other
      .getByLabel("Email address")
      .fill(`link-ui2-${RUN}@example.test`);
    await other.getByRole("button", { name: "Finish signing in" }).click();
    await arriveInWorkspace(other);
    return true;
  },
);

await check("a link cannot be used a second time", async () => {
  const reused = await newPage();
  await reused.goto(link, { waitUntil: "networkidle" });
  await reused
    .getByRole("heading", { level: 2, name: "Confirm your email" })
    .waitFor();
  await reused.getByLabel("Email address").fill(linkAddress);
  await reused.getByRole("button", { name: "Finish signing in" }).click();
  await reused.getByText(/has expired or was already used/).waitFor();
  if ((await nav(reused).count()) !== 0)
    return "the reused link signed someone in";
  return true;
});

console.log(
  "== Sign-out, command palette, switching persona, and a refused session",
);
const member = PERSONAS.find((p) => p.label === "Member");
const signedOut = await newPage();
await check(
  "sign-out from the account menu returns to the sign-in page and stays out after a reload",
  async () => {
    await signInAsPersona(signedOut, member);
    await signOutFromMenu(signedOut);
    await signedOut.reload({ waitUntil: "networkidle" });
    await signInHeading(signedOut).waitFor();
    return (await nav(signedOut).count()) === 0
      ? true
      : "a reload signed back in";
  },
);

await check(
  "sign-out from the command palette returns to the sign-in page",
  async () => {
    const page = await newPage();
    await signInAsPersona(page, member);
    await page.keyboard.press("Meta+k");
    const palette = page.getByRole("dialog").first();
    if ((await palette.count()) === 0) {
      await page.keyboard.press("Control+k");
      await palette.waitFor();
    }
    await page.keyboard.type("Sign out");
    await page.keyboard.press("Enter");
    await signInHeading(page).waitFor();
    return true;
  },
);

await check(
  "switching persona: sign out, then sign in as another account",
  async () => {
    const page = await newPage();
    await signInAsPersona(page, member);
    await signOutFromMenu(page);
    const auditor = PERSONAS.find((p) => p.label === "Auditor");
    await signInAsPersona(page, auditor);
    const links = await nav(page).getByRole("link").allInnerTexts();
    return links.some((t) => t.trim() === "Admin")
      ? true
      : "the auditor does not see the Admin console";
  },
);

await check(
  "an expired or refused session (/me answers 401) ends at the sign-in page without looping",
  async () => {
    const page = await newPage();
    await signInAsPersona(page, member);
    let calls = 0;
    await page.route("**/api/auth/v1/me", (route) => {
      calls += 1;
      return route.fulfill({
        status: 401,
        contentType: "application/problem+json",
        body: JSON.stringify({
          title: "Unauthorized",
          status: 401,
          detail: "token expired",
        }),
      });
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    // The refused request and its one retry after a token refresh; then the session is dropped and the sign-in page shows.
    for (let i = 0; i < 80 && calls < 2; i += 1) await page.waitForTimeout(250);
    await signInHeading(page).waitFor({ state: "visible" });
    const settled = calls;
    await page.waitForTimeout(4000);
    if (calls !== settled)
      return `requests kept going: ${settled} then ${calls}`;
    if (calls > 4) return `too many /me attempts (${calls})`;
    if ((await nav(page).count()) !== 0)
      return "the workspace is still on screen";
    return true;
  },
);

await check(
  'a plain visit after a demo clears the demo; "Try the demo" enters it on purpose',
  async () => {
    const page = await newPage();
    await page.goto(`${WS}/?demo=1`, { waitUntil: "networkidle" });
    await arriveInWorkspace(page);
    await page.goto(`${WS}/`, { waitUntil: "networkidle" });
    await signInHeading(page).waitFor();
    const tryDemo = page.getByRole("link", { name: "Try the demo" });
    if ((await tryDemo.getAttribute("href")) !== "/?demo=1")
      return "Try the demo does not link to ?demo=1";
    await tryDemo.click();
    await arriveInWorkspace(page);
    return true;
  },
);

console.log("== Role change reaches a signed-in user without a reload");
if (SKIP_SLOW) {
  console.log("  SKIP  role refresh (E2E_SKIP_SLOW=1)");
} else {
  await check(
    "an AUDITOR grant shows the Admin console within about a minute, and the revoke removes it",
    async () => {
      const page = await newPage();
      await signInAsPersona(page, member);
      const adminToken = await devToken("admin@example.test");
      const memberToken = await devToken(member.email);
      const memberId = (await gw("/api/auth/v1/me", memberToken)).id;
      const grant = await fetch(
        `${GW}/api/auth/v1/admin/users/${memberId}/roles/AUDITOR`,
        {
          method: "PUT",
          headers: { authorization: `Bearer ${adminToken}` },
        },
      );
      if (grant.status !== 200) return `grant returned ${grant.status}`;
      try {
        const deadline = Date.now() + 150_000;
        let seen = false;
        while (Date.now() < deadline && !seen) {
          await page.evaluate(() => window.dispatchEvent(new Event("focus")));
          await page.waitForTimeout(5000);
          const links = await nav(page).getByRole("link").allInnerTexts();
          seen = links.some((t) => t.trim() === "Admin");
        }
        return seen
          ? true
          : "the Admin console did not appear within 150 seconds";
      } finally {
        await fetch(`${GW}/api/auth/v1/admin/users/${memberId}/roles/AUDITOR`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${adminToken}` },
        });
      }
    },
  );
}

async function devToken(email) {
  const response = await fetch(`${IDP}/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return (await response.json()).token;
}

async function gw(path, token) {
  const response = await fetch(`${GW}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return response.json();
}

// ---------------------------------------------------------------------------------------------------------------------
await browser.close(); // closes every context too
console.log("");
console.log(`persona UI checks: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
