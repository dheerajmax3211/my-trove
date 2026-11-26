// Builds the Content-Security-Policy for one web app from its built index.html and the build-time URLs, and writes
// it as an nginx snippet. Run in the web image's build stage:  node csp.mjs <dist dir> <output file>
// Inline scripts are allowed by hash only (the theme script that runs before first paint); everything else the app
// loads comes from its own origin, except the API and Firebase sign-in.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dist, out] = process.argv.slice(2);
const html = readFileSync(join(dist, "index.html"), "utf8");
const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
  (m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`,
);

const origin = (value) => {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
};
const env = process.env;
const api = origin(env.VITE_API_BASE_URL);
const devIdp = origin(env.VITE_DEV_IDP_URL);
const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN ? `https://${env.VITE_FIREBASE_AUTH_DOMAIN}` : null;
const firebase = [
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://www.googleapis.com",
];
const list = (...items) => items.flat().filter(Boolean).join(" ");

const policy = [
  "default-src 'self'",
  `script-src ${list("'self'", hashes, authDomain && "https://apis.google.com")}`,
  // React and the motion library set inline style attributes; styles cannot run code.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${list("'self'", api, devIdp, authDomain && firebase)}`,
  `frame-src ${list(authDomain) || "'none'"}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

writeFileSync(out, `add_header Content-Security-Policy "${policy}" always;\n`);
console.log(`CSP: ${policy}`);
