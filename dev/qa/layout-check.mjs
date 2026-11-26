#!/usr/bin/env node
// Layout check for product pages: each route, as the right persona, at 390 and 1440, light and dark.
// Records scroll width against the viewport, the elements that run past the edge, page errors and console errors.
// Screenshots go to QA_SHOTS (default: the session scratchpad), never to git.
//
//   node dev/qa/layout-check.mjs                       all targets, defaults below
//   QA_ONLY=waiting-on node dev/qa/layout-check.mjs    one target
//   QA_BASE_WORKSPACE=http://localhost:5391 ...        point every target at another workspace server
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

// Every product is a module of the workspace (`dev/web.sh`, port 5190); override with QA_BASE_WORKSPACE.
const WS = process.env.QA_BASE_WORKSPACE || "http://localhost:5190";
const mod = (id, routes) => ({
  name: id === "core" ? "household" : id,
  base: WS,
  signin: "chooser",
  persona: "owner",
  start: `/app/${id}`,
  routes: routes.map((r) =>
    r.startsWith("FIRST:")
      ? `FIRST:/app/${id}${r.slice("FIRST:".length)}`
      : `/app/${id}${r}`,
  ),
});
const TARGETS = [
  {
    name: "workspace",
    base: WS,
    signin: "chooser",
    persona: "owner",
    routes: ["/", "/account"],
  },
  {
    // The admin console as the ADMIN persona (admin@example.test): the module lives at /app/admin in the workspace.
    name: "admin-console",
    base: WS,
    signin: "chooser",
    persona: "admin",
    routes: [
      "/app/admin",
      "/app/admin/users",
      "/app/admin/roles",
      "/app/admin/usage",
      "/app/admin/audit",
      "/app/admin/flags",
      "/app/admin/plans",
    ],
  },
  mod("waiting-on", ["", "/new", "FIRST:/items/"]),
  mod("consent", ["/requests", "/grants", "/vault", "/clients", "/history", "/audit"]),
  mod("home-pulse", ["/devices", "/alerts", "/reminders", "/appliances/new"]),
  mod("ask-your-life", ["/add", "/library"]),
  mod("digital-legacy", ["/vault", "/trustees", "/policy", "/timeline"]),
  mod("family-treasury", ["FIRST:/h/"]),
  mod("core", ["", "/households", "/reminders", "/files", "/activity"]),
  {
    // Digital Legacy's trustee portal: public, no sign-in.
    name: "trustee-portal",
    base: WS,
    signin: "none",
    persona: "owner",
    routes: ["/trustee", "/trustee/combine"],
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
    if (target.signin !== "none") {
      const signPage = await signed.newPage();
      await signInAs(signPage, target.base, persona);
    }
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
            await page.goto(`${target.base}${target.start ?? "/"}`, {
              waitUntil: "networkidle",
            });
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
