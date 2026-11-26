#!/usr/bin/env node
// Persona walk: every product route, as each seeded persona, against the live workspace (dev/web.sh, :5190).
// For each persona and route it records the final URL (redirects show here), whether the page still shows a loading
// placeholder after it settles, uncaught page errors, API responses that failed, and horizontal overflow at 390px.
//
//   node dev/qa/persona-walk.mjs                  all personas, all routes
//   QA_PERSONAS=member,auditor node dev/qa/persona-walk.mjs
//
// Exits 1 if any page throws an uncaught error, any API call the persona was allowed to make returns 5xx, or any
// page overflows at 390px. Forbidden routes are expected to refuse; they are reported, not failed.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PERSONAS,
  collectErrors,
  launch,
  layoutFacts,
  newContext,
  settle,
  shotDir,
  signInAs,
} from "./lib.mjs";

const BASE = process.env.QA_BASE_WORKSPACE || "http://localhost:5190";
const ROUTES = [
  "/app/core",
  "/app/waiting-on",
  "/app/consent",
  "/app/ask-your-life",
  "/app/digital-legacy",
  "/app/family-treasury",
  "/app/home-pulse",
  "/app/admin",
  "/account",
];
const wanted = (process.env.QA_PERSONAS || Object.keys(PERSONAS).join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const browser = await launch();
const rows = [];
let hardFail = 0;
const shots = shotDir();

for (const key of wanted) {
  const persona = PERSONAS[key];
  if (!persona) throw new Error(`unknown persona ${key}`);
  const context = await newContext(browser, { width: 390 });
  const page = await context.newPage();
  await signInAs(page, BASE, persona);
  for (const route of ROUTES) {
    const errors = collectErrors(page);
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await settle(page, 1500);
    const finalPath = new URL(page.url()).pathname;
    const bodyText = await page.evaluate(() => document.body.innerText);
    const loading = /\bLoading\b/.test(bodyText) && !/Loaded/.test(bodyText);
    const forbidden = /not part of your role|not (allowed|available)|don.t have access|forbidden|403/i.test(bodyText);
    const layout = await layoutFacts(page);
    const apiFailures = errors.filter((e) => e.startsWith("HTTP "));
    const apiServer = apiFailures.filter((e) => /^HTTP 5/.test(e));
    const pageErrors = errors.filter((e) => e.startsWith("pageerror") || (!e.startsWith("HTTP ") && !/favicon|Failed to load resource/.test(e)));
    if (pageErrors.length || apiServer.length || layout.overflowPx > 0) hardFail++;
    const shot = join(shots, `persona-${key}-${route.replace(/\//g, "_") || "root"}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    rows.push({
      persona: key,
      route,
      landed: finalPath,
      redirected: finalPath !== route,
      forbiddenText: forbidden,
      stuckLoading: loading,
      overflowPx: layout.overflowPx,
      pageErrors: pageErrors.slice(0, 3),
      apiFailures: apiFailures.slice(0, 3),
      shot,
    });
    errors.length = 0;
  }
  await context.close();
}
await browser.close();

const out = join(shots, "persona-walk.json");
writeFileSync(out, JSON.stringify(rows, null, 2));
for (const r of rows) {
  const flags = [
    r.redirected ? `-> ${r.landed}` : "",
    r.forbiddenText ? "FORBIDDEN-TEXT" : "",
    r.stuckLoading ? "STUCK-LOADING" : "",
    r.overflowPx ? `OVERFLOW ${r.overflowPx}px` : "",
    r.pageErrors.length ? `PAGE-ERR ${r.pageErrors.length}` : "",
    r.apiFailures.length ? `API ${r.apiFailures.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("  ");
  console.log(`${r.persona.padEnd(10)} ${r.route.padEnd(22)} ${flags || "ok"}`);
}
console.log(`\nreport: ${out}\nhard failures: ${hardFail}`);
process.exit(hardFail ? 1 : 0);
