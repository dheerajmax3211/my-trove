#!/usr/bin/env node
// Sample third-party app for the Consent flow. It asks the owner for access through the real consent gateway,
// waits for the owner's decision in the Consent app, then reads only what the owner approved.
//
//   1. In the Consent app (http://localhost:5189/clients, signed in as the owner) register an app with the
//      scopes it may ask for, e.g. profile.sizes:read. Copy the client id and secret; the secret is shown once.
//   2. Run:
//        CONSENT_CLIENT_ID=cl_... CONSENT_CLIENT_SECRET=cs_... node dev/consent-sample-app.mjs profile.sizes:read
//   3. Approve the request in the Consent app's Requests page (http://localhost:5189/requests). Approve all of it
//      or narrow it; the sample only ever sees what you approve.
//
// Options (environment): CONSENT_GATEWAY_URL (default http://localhost:8080/api/consent),
// CONSENT_PURPOSE, CONSENT_WAIT_SECONDS (default 600), CONSENT_REREAD_AFTER_SECONDS (default 0: no second read).
// Zero dependencies; Node 18+.

const GW = process.env.CONSENT_GATEWAY_URL ?? 'http://localhost:8080/api/consent';
const CLIENT_ID = process.env.CONSENT_CLIENT_ID;
const CLIENT_SECRET = process.env.CONSENT_CLIENT_SECRET;
const PURPOSE = process.env.CONSENT_PURPOSE ?? 'Check your shoe size for a refund claim you asked for.';
const WAIT_SECONDS = Number(process.env.CONSENT_WAIT_SECONDS ?? 600);
const REREAD_AFTER = Number(process.env.CONSENT_REREAD_AFTER_SECONDS ?? 0);
const SCOPES = process.argv.slice(2).length ? process.argv.slice(2) : ['profile.sizes:read'];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set CONSENT_CLIENT_ID and CONSENT_CLIENT_SECRET (register the app in the Consent app first).');
  process.exit(2);
}

const log = (msg) => console.log(`[sample-app ${new Date().toISOString().slice(11, 19)}] ${msg}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(method, path, { token, form, json } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  } else if (json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const res = await fetch(GW + path, { method, headers, body });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

// 1. Client credentials: the app authenticates as itself, not as the owner.
const tokenRes = await call('POST', '/v1/oauth/token', {
  form: { grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
});
if (tokenRes.status !== 200) {
  log(`token failed: HTTP ${tokenRes.status} ${JSON.stringify(tokenRes.data)}`);
  process.exit(1);
}
const clientToken = tokenRes.data.access_token;
log(`authenticated as the app; granted client scope: ${tokenRes.data.scope}`);

// 2. Ask for access. Nothing is shared yet: the owner decides.
const reqRes = await call('POST', '/v1/gateway/requests', {
  token: clientToken,
  json: { scopes: SCOPES, purpose: PURPOSE, durationSeconds: 3600, maxReads: 5 },
});
if (reqRes.status !== 201) {
  log(`request failed: HTTP ${reqRes.status} ${JSON.stringify(reqRes.data)}`);
  process.exit(1);
}
const requestId = reqRes.data.id;
log(`request ${requestId} sent for ${SCOPES.join(', ')}`);
log('Now approve it in the Consent app: http://localhost:5189/requests (signed in as the owner).');

// 3. Wait for the owner's decision.
const deadline = Date.now() + WAIT_SECONDS * 1000;
let view;
let announced = '';
while (Date.now() < deadline) {
  const poll = await call('GET', `/v1/gateway/requests/${requestId}`, { token: clientToken });
  view = poll.data;
  if (view.status !== announced) {
    announced = view.status;
    log(`status: ${view.status}`);
  }
  if (view.grantId || ['DENIED', 'EXPIRED', 'CANCELLED'].includes(view.status)) break;
  await sleep(3000);
}
if (!view?.grantId) {
  log(`no grant (final status ${view?.status ?? 'unknown'}); nothing was shared`);
  process.exit(view?.status === 'DENIED' ? 0 : 1);
}

// 4. Exchange the grant for an access token that can read only the approved scopes.
const exchange = await call('POST', `/v1/gateway/grants/${view.grantId}/token`, { token: clientToken });
if (exchange.status !== 200) {
  log(`exchange failed: HTTP ${exchange.status} ${JSON.stringify(exchange.data)}`);
  process.exit(1);
}
const accessToken = exchange.data.access_token;
log(`grant ${view.grantId} exchanged for an access token (scope: ${exchange.data.scope})`);

// 5. Read the approved attributes.
const read = await call('GET', '/v1/gateway/data', { token: accessToken });
if (read.status !== 200) {
  log(`read failed: HTTP ${read.status} ${JSON.stringify(read.data)}`);
  process.exit(1);
}
log(`received ${read.data.attributes.length} attribute(s), ${read.data.readsRemaining ?? 'unlimited'} read(s) left:`);
for (const a of read.data.attributes) {
  console.log(`  ${a.key} = ${JSON.stringify(a.value)} (${a.sensitivity})`);
}

// 6. Ask for something the owner did not approve. The gateway must refuse it.
const outside = await call('GET', '/v1/gateway/data?path=health', { token: accessToken });
log(`asking for health.* (not approved): HTTP ${outside.status} ${outside.data?.code ?? outside.data?.detail ?? ''}`.trim());

// 7. Optional: wait, then read again with the same token. Use this to revoke the grant in the Consent app
//    (Grants page) and watch the read be refused.
if (REREAD_AFTER > 0) {
  log(`waiting ${REREAD_AFTER}s: revoke the grant in the Consent app (http://localhost:5189/grants) to see the next read refused`);
  await sleep(REREAD_AFTER * 1000);
  const again = await call('GET', '/v1/gateway/data', { token: accessToken });
  log(`read after the wait: HTTP ${again.status} ${again.data?.code ?? `${again.data?.attributes?.length ?? 0} attribute(s)`}`);
}
