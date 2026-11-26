#!/usr/bin/env node
// Trove Assistant, end to end in a real browser against the live dev stack (dev/up.sh, dev/seed-personas.sh) and a
// running workspace (dev/web.sh, :5190). Signs in as the owner, opens the assistant from the header and from the
// command palette, asks one question per MCP tool and checks each answer names its product and reads like an answer.
// Each question goes to the gateway's /api/mcp/mcp with the owner's own token, and each call must leave one row in
// mcp.tool_calls (checked with psql in the dev Postgres container when Docker is reachable). A member must see no
// assistant at all.
//
//   node dev/e2e-assistant.mjs
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs node dev/e2e-assistant.mjs
//
// Exits non-zero if any check fails. Screenshots land in dev/.state/e2e-assistant (git-ignored).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONAS, collectErrors, launch, newContext, signInAs } from "./qa/lib.mjs";

const WS = (process.env.WORKSPACE_URL || "http://localhost:5190").replace(/\/+$/, "");
const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, ".state", "e2e-assistant");
mkdirSync(SHOTS, { recursive: true });
const PG_CONTAINER = process.env.PG_CONTAINER || "dev-postgres-1";
const PG_DB = process.env.E2E_DB || "platform";
process.env.DOCKER_HOST ||= `unix://${process.env.HOME}/.colima/default/docker.sock`;

let pass = 0;
let fail = 0;
async function check(name, fn) {
  try {
    await fn();
    pass += 1;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`  FAIL  ${name}\n        ${String(e?.message ?? e).split("\n")[0]}`);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
// The "From <product>" label is styled in capitals, which innerText reports, so compare without case.
const from = (text, product) => text.toLowerCase().includes(`from ${product.toLowerCase()}`);

/** Rows in mcp.tool_calls, or null when the database cannot be reached from here. */
function auditRows() {
  try {
    const out = execFileSync(
      "docker",
      ["exec", PG_CONTAINER, "psql", "-U", "platform", "-d", PG_DB, "-At", "-c", "select count(*) from mcp.tool_calls"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return Number(out.trim());
  } catch {
    return null;
  }
}

const browser = await launch();

// ---- owner ---------------------------------------------------------------------------------------------------
console.log("== Owner (dev@example.test)");
const ownerContext = await newContext(browser, { width: 1280 });
const page = await ownerContext.newPage();
const errors = collectErrors(page);
const mcpCalls = [];
page.on("response", (r) => {
  if (r.url().includes("/api/mcp/mcp") && r.request().method() === "POST") {
    mcpCalls.push({ status: r.status(), auth: r.request().headers()["authorization"] ?? "" });
  }
});
await signInAs(page, WS, PERSONAS.owner);
const before = auditRows();

const panel = page.getByRole("dialog", { name: "Trove Assistant" });
const box = panel.getByRole("textbox", { name: "Your question" });
const answers = panel.getByRole("list", { name: "Answers" });
const newest = answers.getByRole("listitem").first();

async function ask(question) {
  await box.fill(question);
  await box.press("Enter");
  // The newest answer is first; wait until it has stopped loading.
  await newest.getByText(question, { exact: true }).waitFor({ timeout: 10_000 });
  await page.waitForFunction(
    () => !document.querySelector('[role="dialog"] ol li:first-child [role="status"], [role="dialog"] ol li:first-child [aria-busy="true"]'),
    null,
    { timeout: 15_000 },
  );
  return (await newest.innerText()).replace(/\s+/g, " ");
}

await check("the header has an Ask the assistant button that opens the panel", async () => {
  await page.getByRole("button", { name: "Ask the assistant" }).click();
  await panel.waitFor({ timeout: 5_000 });
  expect(await box.evaluate((el) => el === document.activeElement), "focus is not in the question box");
});

await check("the footer says each question is audited", async () => {
  await panel.getByText("Each question is recorded in your audit log.").waitFor({ timeout: 2_000 });
});

await check("Waiting On answers 'What am I waiting on?'", async () => {
  const text = await ask("What am I waiting on?");
  expect(from(text, "Waiting On"), `no source label: ${text}`);
  expect(/You're waiting on \d+ things?\.|You aren't waiting on anything/.test(text), `not an answer: ${text}`);
});

await check("Home Pulse answers 'Is the fridge OK?'", async () => {
  const text = await ask("Is the fridge OK?");
  expect(from(text, "Home Pulse"), `no source label: ${text}`);
  expect(/look(s)? fine|needs? attention|haven't added any appliances/.test(text), `not an answer: ${text}`);
});

await check("Family Treasury answers 'What is our household balance?' (asking which household if several)", async () => {
  let text = await ask("What is our household balance?");
  expect(from(text, "Family Treasury"), `no source label: ${text}`);
  if (text.includes("Which one?")) {
    const choice = newest.getByRole("group", { name: "Choose a household" }).getByRole("button").first();
    const name = (await choice.innerText()).trim();
    await choice.click();
    await newest.getByText(name, { exact: true }).first().waitFor({ timeout: 10_000 });
    await page.waitForFunction(
      () => !document.querySelector('[role="dialog"] ol li:first-child [role="status"]'),
      null,
      { timeout: 15_000 },
    );
    text = (await newest.innerText()).replace(/\s+/g, " ");
  }
  expect(/Balances for|don't belong to a household/.test(text), `not an answer: ${text}`);
});

await check("Ask Your Life answers anything else, with a cited quote", async () => {
  const text = await ask("When does my passport expire?");
  expect(from(text, "Ask Your Life"), `no source label: ${text}`);
  const quote = newest.getByRole("blockquote");
  expect((await quote.count()) === 1 || text.includes("Nothing in your notes"), `no quote: ${text}`);
  if ((await quote.count()) === 1) {
    expect((await newest.locator("cite").count()) === 1, "the quote cites no document");
  }
});
await page.screenshot({ path: join(SHOTS, "owner-answers.png") });

await check("every question went to /api/mcp/mcp with the owner's own token and got 200", async () => {
  expect(mcpCalls.length >= 4, `only ${mcpCalls.length} MCP calls`);
  expect(mcpCalls.every((c) => c.status === 200), `statuses ${mcpCalls.map((c) => c.status).join(",")}`);
  expect(mcpCalls.every((c) => c.auth.startsWith("Bearer ")), "a call went without a bearer token");
});

await check("each call left a row in the MCP audit (mcp.tool_calls)", async () => {
  const after = auditRows();
  if (before === null || after === null) {
    console.log("        (skipped: the dev Postgres container is not reachable from here)");
    return;
  }
  expect(after - before === mcpCalls.length, `audit grew by ${after - before}, calls ${mcpCalls.length}`);
});

await check("a link in an answer opens the product page and closes the panel", async () => {
  await answers.getByRole("link", { name: "Open Waiting On" }).first().click();
  await panel.waitFor({ state: "hidden", timeout: 5_000 });
  expect(page.url().includes("/app/waiting-on"), `went to ${page.url()}`);
});

await check("the command palette opens it (⌘K, 'Ask the assistant') and Escape closes it", async () => {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await page.getByRole("dialog", { name: "Search the workspace" }).waitFor({ timeout: 5_000 });
  await page.keyboard.type("ask the assistant");
  await page.keyboard.press("Enter");
  await panel.waitFor({ timeout: 5_000 });
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "hidden", timeout: 5_000 });
});

await check("no page errors and no failed gateway calls", async () => {
  expect(errors.length === 0, errors.join(" | "));
});
await ownerContext.close();

// ---- member --------------------------------------------------------------------------------------------------
console.log("== Member (member@example.test)");
const memberContext = await newContext(browser, { width: 1280 });
const memberPage = await memberContext.newPage();
await signInAs(memberPage, WS, PERSONAS.member);
await check("a member sees no assistant button and no palette entry", async () => {
  await memberPage.getByRole("navigation", { name: "Workspace" }).waitFor({ timeout: 10_000 });
  expect((await memberPage.getByRole("button", { name: "Ask the assistant" }).count()) === 0, "button shown");
  await memberPage.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  const palette = memberPage.getByRole("dialog", { name: "Search the workspace" });
  await palette.waitFor({ timeout: 5_000 });
  expect((await palette.getByText("Ask the assistant").count()) === 0, "palette entry shown");
});
await memberContext.close();

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
