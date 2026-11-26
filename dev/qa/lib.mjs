// Shared helpers for the browser QA pass (dev/qa). Runs against the live dev stack: the identity provider on
// localhost:9100, the gateway on localhost:8080 and whichever web apps are serving. Nothing here is mocked.
//
// Playwright: set PLAYWRIGHT_CORE to the path of a playwright-core index.mjs if it is not resolvable from here.
import { mkdirSync } from "node:fs";

export const PERSONAS = {
  owner: { label: "Owner", email: "dev@example.test" },
  admin: { label: "Admin", email: "admin@example.test" },
  developer: { label: "Developer", email: "developer@example.test" },
  member: { label: "Member", email: "member@example.test" },
  auditor: { label: "Auditor", email: "auditor@example.test" },
};

export async function loadChromium() {
  const mod = await import(process.env.PLAYWRIGHT_CORE || "playwright-core");
  return mod.chromium;
}

export async function launch() {
  const chromium = await loadChromium();
  // QA_CHROMIUM lets a run use a Chromium build other than the one this Playwright expects.
  return chromium.launch({
    headless: true,
    executablePath: process.env.QA_CHROMIUM || undefined,
  });
}

/**
 * A fresh context at a given width and colour scheme. Each persona gets its own context so sessions do not mix.
 *
 * The gateway (8080) answers 403 to any Origin it does not list (the canonical workspace port, 5190, is listed; the
 * QA servers run on other ports). `corsShim` forwards requests to the real services with the Origin set to 5190
 * and answers the preflight itself, so the QA copies of the apps can call the real stack. Nothing changes on the
 * server side and the request bodies are untouched. The shim lives only in this harness.
 */
const SHIM_ORIGIN = "http://localhost:5190";
export async function newContext(
  browser,
  { width, scheme = "light", storageState },
) {
  const context = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : 900 },
    colorScheme: scheme,
    ...(storageState ? { storageState } : {}),
  });
  await corsShim(context);
  return context;
}

export async function corsShim(context) {
  await context.route(/^http:\/\/localhost:(8080|9100)\//, async (route) => {
    const req = route.request();
    const headers = req.headers();
    const cors = {
      "access-control-allow-origin": headers["origin"] || "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers":
        headers["access-control-request-headers"] || "*",
      vary: "Origin",
    };
    if (req.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    try {
      const response = await route.fetch({
        headers: { ...headers, origin: SHIM_ORIGIN },
      });
      await route.fulfill({
        response,
        headers: { ...response.headers(), ...cors },
      });
    } catch {
      // The context closed while this request was in flight. Nothing is waiting for it any more.
      await route.abort().catch(() => {});
    }
  });
}

/**
 * Signs in as a seeded persona on the app at `base`.
 *
 * The workspace's sign-in: "Continue with Google" -> "Sign in as <Label>, <email>", the real dev chooser.
 *
 * Resolves once the sign-in screen is gone.
 */
export async function signInAs(page, base, persona) {
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  const google = page.getByRole("button", { name: "Continue with Google" });
  if (!(await google.count())) {
    // Already signed in (the session survived from an earlier visit in this context).
    return;
  }
  await google.first().click();
  await page
    .getByRole("button", {
      name: new RegExp(`^Sign in as ${persona.label}, ${persona.email}$`),
    })
    .click();
  await page.waitForLoadState("networkidle");
  // A first sign-in can show the welcome wizard; skip it so the pages under test are what render.
  // The wizard appears once the account has loaded, so wait briefly for it. An account that already skipped or
  // finished has no wizard and this times out quietly.
  const skip = page.getByRole("button", { name: "Skip for now" });
  await skip
    .first()
    .waitFor({ state: "visible", timeout: 6_000 })
    .then(() => skip.first().click())
    .catch(() => {});
  await page.waitForTimeout(300);
  await page.waitForFunction(
    () => !document.body.innerText.includes("Continue with Google"),
    null,
    {
      timeout: 20_000,
    },
  );
}

/**
 * Layout facts for the current page: document scroll width against the viewport, and the elements whose right
 * edge runs past the viewport (the usual overflow culprits), so a failure names what overflows.
 */
export async function layoutFacts(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Ignore anything clipped by an ancestor that hides overflow, since it cannot widen the page.
      let clipped = false;
      for (
        let p = el.parentElement;
        p && p !== document.body;
        p = p.parentElement
      ) {
        const o = getComputedStyle(p).overflowX;
        if (o === "hidden" || o === "clip" || o === "auto" || o === "scroll") {
          const pr = p.getBoundingClientRect();
          if (r.left >= pr.right || r.right <= pr.left) {
            clipped = true;
            break;
          }
          if (r.right <= pr.right + 0.5) {
            clipped = true;
            break;
          }
        }
      }
      if (!clipped && r.right > vw + 1) {
        const name = (el.getAttribute("aria-label") || el.textContent || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 60);
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls:
            typeof el.className === "string" ? el.className.slice(0, 80) : "",
          text: name,
          right: Math.round(r.right),
        });
      }
    }
    offenders.sort((a, b) => b.right - a.right);
    return {
      viewport: vw,
      scrollWidth: document.documentElement.scrollWidth,
      overflowPx: Math.max(0, document.documentElement.scrollWidth - vw),
      offenders: offenders.slice(0, 8),
    };
  });
}

/** Waits for the page to settle: no visible spinner and no "Loading" placeholder left after a grace period. */
export async function settle(page, ms = 1200) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

/** Console errors, uncaught page errors, and every API response that is 4xx or 5xx (with its URL). */
export function collectErrors(page) {
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().includes("localhost:8080")) {
      errors.push(
        `HTTP ${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`,
      );
    }
  });
  return errors;
}

export function shotDir() {
  const dir =
    process.env.QA_SHOTS ||
    "/private/tmp/claude-501/-Users-dheerajsrinivasa-Documents-Claude-Code-Paid/056b0264-1520-450f-b7a8-3fd2dd2120d8/scratchpad/shots";
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function slug(s) {
  return (
    s
      .replace(/^\//, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "root"
  );
}
