#!/usr/bin/env node
// Live check for notifications, against the running dev stack, Mailpit and a running workspace:
//   1. a reminder for member@example.test comes due and its email arrives in Mailpit (SMTP, not the log);
//   2. the in-app inbox shows it, with an unread count;
//   3. in a real browser, signed in as the member, the workspace bell shows the count and the item, and marking it
//      read clears it.
//
//   node dev/e2e-notifications.mjs
//   GATEWAY_URL=http://localhost:8080 WORKSPACE_URL=http://localhost:5190 MAILPIT_URL=http://localhost:8025 node ...
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs node dev/e2e-notifications.mjs   (if not resolvable)
//
// Needs: dev/up.sh (shared-service with MAIL_ENABLED=true), dev/docker-compose.yml's mailpit, dev/web.sh (workspace).
// Exits non-zero if any check fails. Screenshots go to dev/.state/e2e (git-ignored).
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(
  process.env.PLAYWRIGHT_CORE || "playwright-core"
);

const trim = (s) => s.replace(/\/+$/, "");
const WS = trim(process.env.WORKSPACE_URL || "http://localhost:5190");
const GW = trim(process.env.GATEWAY_URL || "http://localhost:8080");
const IDP = trim(process.env.IDP_URL || "http://localhost:9100");
const MAILPIT = trim(process.env.MAILPIT_URL || "http://localhost:8025");
const MEMBER = "member@example.test";
const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, ".state", "e2e");
mkdirSync(SHOTS, { recursive: true });

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
    const message =
      error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.log(`  FAIL  ${name}  (${message})`);
  }
}
const eq = (actual, expected) =>
  actual === expected
    ? undefined
    : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;

async function idpToken(email) {
  const res = await fetch(`${IDP}/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`identity provider answered ${res.status}`);
  return (await res.json()).token;
}

/** A call through the gateway to the shared service, as the signed-in member. */
async function shared(token, method, path, body) {
  const res = await fetch(`${GW}/api/shared${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** Polls Mailpit until a message with this subject arrives, or gives up. */
async function waitForMail(subject, timeoutMs) {
  const query = encodeURIComponent(`subject:"${subject}"`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${query}`);
    const list = await res.json();
    if (list.messages && list.messages.length > 0) return list.messages[0];
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

console.log(
  `Notifications live check: gateway ${GW}, workspace ${WS}, mailpit ${MAILPIT}`,
);

const title = `Live check reminder ${Date.now()}`;
let token;
let reminderId;
let mailId;

await check(
  "the member can reach the platform through the gateway",
  async () => {
    token = await idpToken(MEMBER);
    const r = await shared(token, "GET", "/v1/notifications/unread-count");
    return eq(r.status, 200);
  },
);

await check("a reminder for the member, already due, is created", async () => {
  const r = await shared(token, "POST", "/v1/reminders", {
    title,
    dueAt: new Date(Date.now() - 60_000).toISOString(),
  });
  reminderId = r.body?.id;
  return eq(r.status, 201) || (reminderId ? undefined : "no reminder id");
});

await check(
  "its email arrives in Mailpit, addressed to the member",
  async () => {
    const message = await waitForMail(title, 90_000);
    if (!message)
      return "no email within 90 seconds (is shared-service running with MAIL_ENABLED=true?)";
    mailId = message.ID;
    return eq(message.To?.[0]?.Address, MEMBER);
  },
);

await check("the email body says the reminder is due", async () => {
  if (!mailId) return "no email to read";
  const res = await fetch(`${MAILPIT}/api/v1/message/${mailId}`);
  const full = await res.json();
  return full.Text?.includes("is due now")
    ? undefined
    : "no due-now wording in the email text";
});

await check(
  "the in-app inbox lists it, unread, with a count of at least one",
  async () => {
    const list = await shared(token, "GET", "/v1/notifications");
    const item = list.body?.find((n) => n.title === title);
    if (!item) return "not in the inbox";
    if (item.readAt !== null) return "already read";
    const count = await shared(token, "GET", "/v1/notifications/unread-count");
    return count.body?.count >= 1
      ? undefined
      : `unread count is ${count.body?.count}`;
  },
);

// The installed Google Chrome when there is one (no browser download); otherwise Playwright's own build.
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH || existsSync(CHROME)
    ? { executablePath: process.env.CHROME_PATH || CHROME }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(20_000);

try {
  await check(
    "the member signs in to the workspace through the dev chooser",
    async () => {
      await page.goto(`${WS}/`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Continue with Google" }).click();
      await page
        .getByRole("button", {
          name: /^Sign in as Member, member@example\.test$/,
        })
        .click();
      const skip = page.getByRole("button", { name: "Skip for now" });
      const nav = page.getByRole("navigation", { name: "Workspace" });
      await nav.or(skip).first().waitFor();
      if (await skip.count()) await skip.first().click();
      await nav.waitFor();
    },
  );

  await check("the bell shows an unread count", async () => {
    const bell = page.getByRole("button", { name: /^Notifications/ });
    await bell.waitFor();
    // The count loads after the workspace shell, so wait for it rather than reading the label once.
    await page.waitForFunction(
      () => {
        const button = [...document.querySelectorAll("button")].find((b) =>
          /^Notifications/.test(b.getAttribute("aria-label") || ""),
        );
        return /Notifications, [1-9]\d* unread/.test(
          button?.getAttribute("aria-label") || "",
        );
      },
      null,
      { timeout: 30_000 },
    );
    return undefined;
  });

  await check("opening the bell lists the reminder", async () => {
    await page.getByRole("button", { name: /^Notifications/ }).click();
    const dialog = page.getByRole("dialog", { name: "Notifications" });
    await dialog.waitFor();
    const item = dialog.getByRole("button", { name: new RegExp(title) });
    await item.waitFor();
    await page.screenshot({ path: join(SHOTS, "notifications-bell.png") });
    return undefined;
  });

  await check("marking it read clears it from the unread list", async () => {
    const dialog = page.getByRole("dialog", { name: "Notifications" });
    await dialog.getByRole("button", { name: new RegExp(title) }).click();
    await page.waitForFunction((t) => {
      const items = [...document.querySelectorAll('[role="dialog"] li')];
      const li = items.find((el) => el.textContent?.includes(t));
      return li?.getAttribute("data-unread") === "false";
    }, title);
    const list = await shared(token, "GET", "/v1/notifications");
    const item = list.body?.find((n) => n.title === title);
    return item?.readAt ? undefined : "server still shows it unread";
  });
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
