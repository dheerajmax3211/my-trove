// k6 load test for the gateway. Two scenarios only: "steady" and "probe". See README.md.
//
// Environment (read from __ENV):
//   BASE_URL  gateway, default http://localhost:8080
//   IDP_URL   dev identity provider, default http://localhost:9100
//   RUN_ID    optional; makes generated test users unique per run (default: epoch millis at setup)
//   SCENARIO  optional; "steady" or "probe" runs just that one. Unset runs both (probe starts after steady).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const IDP_URL = __ENV.IDP_URL || 'http://localhost:9100';

// 429 is the gateway doing its job, not a failure: keep it out of http_req_failed. Anything else
// outside 200 (401, 5xx, ...) still counts as failed.
http.setResponseCallback(http.expectedStatuses(200, 429));

// Every gateway response adds 0 or 1 here, so thresholds on these always have samples.
const rateLimited = new Counter('rate_limited_responses'); // 429s
const serverErrors = new Counter('server_error_responses'); // 5xx
const retryAfterOnReject = new Rate('retry_after_on_429'); // samples only on 429s

// Read endpoints, both routed by the gateway (prefix /api/<service> stripped) and needing only a valid token.
const READ_PATHS = [
  '/api/auth/v1/me', // auth MeController GET /v1/me
  '/api/shared/v1/notifications/unread-count', // shared InboxController GET /v1/notifications/unread-count
];

const all = {
  steady: {
    executor: 'constant-vus',
    vus: 50,
    duration: '2m',
    exec: 'steady',
  },
  probe: {
    executor: 'per-vu-iterations',
    vus: 1,
    iterations: 1,
    maxDuration: '1m',
    exec: 'probe',
    // Runs after steady (2m) plus a margin, so the probe's burst never overlaps steady load.
    startTime: __ENV.SCENARIO ? '0s' : '2m30s',
  },
};
const only = __ENV.SCENARIO;
const scenarios = only && all[only] ? { [only]: all[only] } : all;

const thresholds = {};
if (scenarios.steady) {
  Object.assign(thresholds, {
    // Gateway reads only; the sign-in call to the identity provider is tagged separately.
    'http_req_duration{scenario:steady,endpoint:gateway}': ['p(95)<300'],
    'http_req_failed{scenario:steady}': ['rate<0.01'],
    // Each VU is its own user and stays under 120 rpm, so no request may be rate limited.
    'rate_limited_responses{scenario:steady}': ['count==0'],
  });
}
if (scenarios.probe) {
  Object.assign(thresholds, {
    'rate_limited_responses{scenario:probe}': ['count>=1'],
    'retry_after_on_429{scenario:probe}': ['rate==1'],
    'server_error_responses{scenario:probe}': ['count==0'],
  });
}
thresholds['server_error_responses'] = ['count==0'];

export const options = { scenarios, thresholds };

export function setup() {
  return { runId: __ENV.RUN_ID || String(Date.now()) };
}

function signIn(email) {
  const res = http.post(
    `${IDP_URL}/token`,
    JSON.stringify({ email, name: 'Load Test' }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'signin' } },
  );
  const ok = check(res, { 'sign-in 200': (r) => r.status === 200 });
  return ok ? res.json('token') : null;
}

function record(res) {
  rateLimited.add(res.status === 429 ? 1 : 0);
  serverErrors.add(res.status >= 500 ? 1 : 0);
  if (res.status === 429) {
    retryAfterOnReject.add(Boolean(res.headers['Retry-After']));
  }
}

let token = null; // per-VU state, kept across iterations

export function steady(data) {
  // One request per iteration, then sleep(1): at most ~1 request/second per VU (60-ish/min, under 120).
  if (!token) {
    token = signIn(`loadtest-${__VU}-${data.runId}@example.test`);
    sleep(1);
    return;
  }
  const path = READ_PATHS[__ITER % READ_PATHS.length];
  const res = http.get(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { endpoint: 'gateway' },
  });
  record(res);
  check(res, { 'read 200': (r) => r.status === 200 });
  sleep(1);
}

export function probe(data) {
  // A fresh user no steady VU uses. 200 requests back to back against a 120/min bucket.
  const t = signIn(`loadtest-probe-${data.runId}@example.test`);
  if (!t) return;
  const requests = [];
  for (let i = 0; i < 200; i++) {
    requests.push(['GET', `${BASE_URL}${READ_PATHS[0]}`, null,
      { headers: { Authorization: `Bearer ${t}` }, tags: { endpoint: 'gateway' } }]);
  }
  http.batch(requests).forEach(record);
}

export function handleSummary(data) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const lines = [];
  for (const [name, m] of Object.entries(data.metrics)) {
    for (const [expr, t] of Object.entries(m.thresholds || {})) {
      lines.push(`${t.ok ? 'PASS' : 'FAIL'}  ${name}  ${expr}`);
    }
  }
  return {
    [`/load/results/${stamp}.json`]: JSON.stringify(data, null, 2),
    stdout: `\nThreshold results\n${lines.join('\n')}\nSummary written to /load/results/${stamp}.json\n`,
  };
}
