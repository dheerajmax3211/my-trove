# Home Pulse (`@platform/home-pulse`)

Predictive maintenance for the home. Smart plugs and ESP32 sensors report the power draw of appliances (fridge,
air conditioner, water pump, washing machine). The `home-pulse` service learns each appliance's normal pattern and
raises alerts before something fails. This app is the owner's view: add appliances, connect devices, read the
power charts, and act on alerts and reminders.

Dev port **5184**. Backend: `personal-platform/home-pulse` (Spring Boot, port 8085).

## Screens

```
/                      Home overview   appliance cards: status (Healthy / Watch / Alert / Learning / No device),
                                       current draw, last seen, open alerts. Empty state explains how to start.
/appliances/new        Add appliance   name, type, location, purchase date, warranty end, service dates, notes
/appliances/:id        Appliance       power chart (hour / day / week / month), health summary (baseline vs last
                                       24 h, duty cycle), alerts for this appliance, warranty and service with
                                       upcoming reminders, edit, delete, relearn baseline
/appliances/:id/edit   Edit appliance  same form, filled in
/devices               Devices         every device with token prefix, status and last seen; register a device
                                       (one-time token dialog with copy, curl and MQTT snippets); revoke with confirm
/alerts                Alerts inbox    severity, status, evidence explained in plain words, acknowledge,
                                       filter by status (and `?appliance=<id>`)
/reminders             Reminders       service due/overdue, warranty ending, anomaly-under-warranty, by priority
```

## The power chart

Hand-written SVG, no chart library (`src/features/readings`):

- `chart/scale.ts`: linear scales, "nice" y ticks (1/2/5 steps), time ticks on round local-time boundaries
  (time zone and daylight saving injectable), nearest-point search. Pure and unit tested.
- `chart/series.ts`: parses buckets, finds **gaps** (no reading for more than 2.5 expected intervals, plus silence
  at the start or end of the window), builds the text summary and the table rows. The line is broken at gaps and
  hatched bands mark them; nothing is interpolated.
- `chart/paths.ts`: line, area and min-to-max band paths per run of readings.
- `components/PowerChart.tsx`: axes, gridlines, tooltip on hover and focus, learned-normal reference line, legend.
- Accessibility: the svg is a labelled image described by a visible text summary (average, extremes, gaps). The
  plot is one tab stop (`role="slider"` over the readings, `aria-valuetext` gives each reading): arrow keys step,
  PageUp/PageDown move by 10, Home/End jump. A "Show data table" button reveals the same data as a real `<table>`
  (summarised into at most 48 time slots for long series, with "No data" rows for gaps).
- The service picks the bucket size from the range (hour: raw, day: 1 minute, week and month: 1 hour). The app
  only sends `from` and `to`.

## Run it

Demo mode (default, zero setup): stub sign-in (starts signed in) and an in-memory mock API.

```bash
pnpm install
pnpm --filter @platform/home-pulse dev        # http://localhost:5184
```

Against the real backend (service on 8085, Firebase Auth or its emulator):

```bash
# apps/home-pulse/.env.local
VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099   # or VITE_FIREBASE_API_KEY + VITE_FIREBASE_PROJECT_ID
pnpm --filter @platform/home-pulse dev
```

The dev server proxies `/api/*` to `http://localhost:8085/*` (the `/api` prefix is stripped, the service serves
`/v1/...`). Set `VITE_API_BASE_URL` to call a service directly (it then needs CORS for this origin).

| Variable                                              | Meaning                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `VITE_USE_MOCK=true`                                  | Force demo mode even when Firebase is configured                                   |
| `VITE_API_BASE_URL`                                   | Service base URL. Default `/api` (dev proxy)                                       |
| `VITE_FIREBASE_*`, `VITE_FIREBASE_AUTH_EMULATOR_HOST` | Firebase Auth. Setting key + project id, or the emulator host, turns demo mode off |

Checks, from the monorepo root: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter "@platform/home-pulse..." build`.

## Mocked vs real

Demo mode replaces the whole backend with `src/mock/mockApi.ts`, which follows the real owner API contract: same
paths, status codes, Spring `ProblemDetail` error bodies, validation messages (`name must not be blank; type must
not be null`), the 409 on a second active device, 409 when acknowledging a resolved alert, 404 for unknown ids,
the reading resolution rules (raw up to 1 h, 1 min up to 2 d, 1 h up to 60 d, else 1 day; 400 days and 5000 points
limits) and the reminder calculator (ported). Four sample appliances cover every state. The power signal is
synthetic and deterministic (cycling compressor, a ramp that models a degrading fridge, a pump stuck on, explicit
outages so gaps show up).

Mock simplifications (not the service's behaviour): a newly registered device "back-fills" seven days of readings so
the chart works immediately; health, baseline and alerts are computed from the synthetic profile or seeded, there is
no evaluation job (tests add alerts with `mock.addAlert`); device ingestion (`/v1/ingest/readings`, MQTT) is not
part of this UI and not mocked.

## Notes on behaviour

- The ingestion token exists only in the register mutation result, is shown in a dialog that cannot be dismissed
  by Escape or a click outside, and is dropped when the person confirms. The list only shows the token prefix.
- Evidence text is generated by `features/alerts/evidence.ts` from the detector's evidence keys per alert kind
  ("Kitchen fridge draws 14% more power than its normal while running"); if the evidence is missing or malformed it
  falls back to the service's own message.
- Server validation errors (`field message; field message`) are mapped back onto form fields.
- Alerts and health refresh every 60 seconds; cards and the nav count update after acknowledging.

## Limitations

- Visual design was checked in the DOM and in tests only, not by eye in a browser or on a phone; contrast comes from
  the platform tokens. Responsive CSS exists (cards reflow, drawer nav from AppShell) but was not looked at at 375px.
- Real-backend mode was not run end to end (no Firebase project or database here); the API layer is verified against
  the controller code and the mock, which is built from it.
- Times use the browser's locale and time zone. Tests pin UTC and assert locale-independent wording.
- "Current draw" is the latest one-minute reading from the last 15 minutes (the service has no live value); a
  quiet appliance shows "No recent reading".
- The device list is assembled from one request per appliance (the service lists devices per appliance).
- The production bundle is one ~620 kB chunk (Firebase included); no code splitting yet.
