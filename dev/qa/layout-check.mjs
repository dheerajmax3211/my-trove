#!/usr/bin/env node
// Layout check for product pages: each route, as the right persona, at 390 and 1440, light and dark.
// Records scroll width against the viewport, the elements that run past the edge, page errors and console errors.
// Screenshots go to QA_SHOTS (default: the session scratchpad), never to git.
//
//   node dev/qa/layout-check.mjs                       all targets, defaults below
//   QA_ONLY=waiting-on node dev/qa/layout-check.mjs    one target
//   QA_BASE_WAITING_ON=http://localhost:5182 ...       point a target at another server
//
// Exits 1 if any page overflows horizontally at 390px or throws an uncaught page error.
// A route written as "FIRST:/prefix" visits the first link on the page whose href starts with /prefix.
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
  slug,
} from "./lib.mjs";

// Default ports are the ones this worktree serves (5381-5387, 5391). Override any with QA_BASE_<NAME>, e.g. the canonical 5190 from dev/web.sh.
const TARGETS = [
  {
    name: "workspace",
    base: process.env.QA_BASE_WORKSPACE || "http://localhost:5391",
    signin: "chooser",
    persona: "owner",
    routes: ["/", "/account"],
  },
  {
    name: "waiting-on",
    base: process.env.QA_BASE_WAITING_ON || "http://localhost:5382",
    signin: "session",
    persona: "owner",
    routes: ["/", "/new", "FIRST:/items/"],
  },
  {
    name: "consent",
    base: process.env.QA_BASE_CONSENT || "http://localhost:5383",
    signin: "session",
    persona: "owner",
    routes: [
      "/requests",
      "/grants",
      "/vault",
      "/clients",
      "/history",
      "/audit",
    ],
  },
  {
    name: "home-pulse",
    base: process.env.QA_BASE_HOME_PULSE || "http://localhost:5384",
    signin: "session",
    persona: "owner",
    routes: ["/devices", "/alerts", "/reminders", "/appliances/new"],
  },
  {
    name: "ask-your-life",
    base: process.env.QA_BASE_ASK_YOUR_LIFE || "http://localhost:5385",
    signin: "session",
    persona: "owner",
    routes: ["/add", "/library"],
  },
  {
    name: "digital-legacy",
    base: process.env.QA_BASE_DIGITAL_LEGACY || "http://localhost:5386",
    signin: "session",
    persona: "owner",
    routes: ["/vault", "/trustees", "/policy", "/timeline"],
  },
  {
    name: "family-treasury",
    base: process.env.QA_BASE_FAMILY_TREASURY || "http://localhost:5387",
    signin: "session",
    persona: "owner",
    routes: ["FIRST:/h/"],
  },
  {
    name: "hub",
    base: process.env.QA_BASE_HUB || "http://localhost:5381",
    signin: "session",
    persona: "owner",
    routes: ["/"],
  },
];

const WIDTHS = [390, 1440];
const SCHEMES = ["light", "dark"];
const only = process.env.QA_ONLY;
const shots = shotDir();
const rows = [];
let failures = 0;

const browser = await launch();
try {
  for (const target of TARGETS) {
    if (only && only !== target.name) continue;
    const persona = PERSONAS[target.persona];
    // Sign in once at the first size, then reuse the session (storage) for the other sizes and schemes.
    const signed = await newContext(browser, { width: 390 });
    const signPage = await signed.newPage();
    await signInAs(signPage, target.base, persona, target.signin);
    const state = await signed.storageState();
    await signed.close();

    for (const width of WIDTHS) {
      for (const scheme of SCHEMES) {
        const ctx = await newContext(browser, {
          width,
          scheme,
          storageState: state,
        });
        const page = await ctx.newPage();
        const errors = collectErrors(page);
        for (const route of target.routes) {
          let path = route;
          if (route.startsWith("FIRST:")) {
            const prefix = route.slice("FIRST:".length);
            await page.goto(`${target.base}/`, { waitUntil: "networkidle" });
            await settle(page, 600);
            const href = await page.evaluate(
              (p) =>
                [...document.querySelectorAll("a[href]")]
                  .map((a) => a.getAttribute("href"))
                  .find((h) => h && h.startsWith(p)),
              prefix,
            );
            if (!href) {
              rows.push({
                target: target.name,
                route,
                width,
                scheme,
                note: "no link found",
              });
              continue;
            }
            path = href.replace(/^\/?/, "/");
          }
          errors.length = 0;
          await page.goto(`${target.base}${path}`, {
            waitUntil: "networkidle",
          });
          await settle(page);
          const facts = await layoutFacts(page);
          const shot = join(
            shots,
            `${target.name}-${slug(path)}-${width}-${scheme}.png`,
          );
          await page.screenshot({ path: shot, fullPage: true });
          const row = {
            target: target.name,
            route: path,
            width,
            scheme,
            scrollWidth: facts.scrollWidth,
            overflowPx: facts.overflowPx,
            offenders: facts.offenders,
            errors: [...errors],
            shot,
          };
          rows.push(row);
          const pageErrors = errors.filter((e) => e.startsWith("pageerror"));
          if ((width === 390 && facts.overflowPx > 0) || pageErrors.length)
            failures += 1;
        }
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}

const report = join(shots, "layout-check.json");
writeFileSync(report, JSON.stringify(rows, null, 2));
for (const r of rows) {
  if (r.note) {
    console.log(`${r.target} ${r.route} ${r.width} ${r.scheme}: ${r.note}`);
    continue;
  }
  const flag = r.overflowPx > 0 ? `OVERFLOW ${r.overflowPx}px` : "fits";
  console.log(
    `${r.target} ${r.route} ${r.width} ${r.scheme}: scrollWidth ${r.scrollWidth} ${flag}, errors ${r.errors.length}`,
  );
  for (const o of r.offenders.slice(0, 3)) {
    console.log(`    <${o.tag}> right=${o.right} "${o.text}"`);
  }
}
console.log(`report: ${report}`);
process.exitCode = failures > 0 ? 1 : 0;
