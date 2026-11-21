# Handoff: home-pulse

## Candidates to promote into `packages/ui`

| Component                                       | Where                                                | Why                                                                                                                                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PowerChart` + `chart/scale`, `series`, `paths` | `src/features/readings`                              | Accessible SVG time-series chart with honest gaps, keyboard slider, text summary and data table. Generic once `Watts`, the "learned normal" line and the copy are props. Scale and tick logic is fully unit tested. |
| `ConfirmDialog`                                 | `src/components/ConfirmDialog.tsx`                   | Every product needs destructive confirmation (busy state, error line, Cancel first).                                                                                                                                |
| `ErrorState`                                    | `src/components/ErrorState.tsx`                      | Request failure with message and retry; wraps `EmptyState` in `role="alert"`.                                                                                                                                       |
| `CopyButton`                                    | `src/components/CopyButton.tsx`                      | Clipboard copy with a polite status message and a failure message.                                                                                                                                                  |
| Segmented range control                         | `src/features/readings/components/RangeSelector.tsx` | Group of `aria-pressed` buttons; the kit has Tabs but no toggle group.                                                                                                                                              |
| Scrollable code block                           | `.code-block` in `app.css`, used in `TokenDialog`    | Focusable `pre` region for snippets.                                                                                                                                                                                |
| `useDocumentTitle`, focus-main-on-navigate      | `src/lib`, `src/shell/AppLayout.tsx`                 | Route-change focus and titles are needed by every app.                                                                                                                                                              |

Small gaps noticed in the kit:

- `Dialog` has no non-dismissible "must acknowledge" mode that also hides the close button other than `dismissible={false}`;
  that works, but a documented `role="alertdialog"` variant would suit one-time secrets and confirmations.
- `DataTable` needs `headerLabel` for non-string headers (used for an "Actions" column); fine, just easy to miss.
- `Badge` has no "count" preset; the nav alert count is a `Badge` plus visually hidden text.
- No shared `.sr-only` class (the kit's `VisuallyHidden` component is used in places; plain CSS elsewhere).

## Dependencies

None added beyond what the gallery uses (`@tanstack/react-query`, `react-router-dom`, workspace packages). No
chart library. `check-versions` passes.

## Assumptions

- The service is reached at `/v1/*`; the dev proxy rewrites `/api/*` to it. A deployed build needs either the same
  rewrite or `VITE_API_BASE_URL` plus CORS on the service. `BrowserRouter` is used, so the host must serve
  `index.html` for unknown paths (Vite dev and preview do).
- `AlertResponse` carries no appliance type, so alert wording is generic ("draws 14% more power") rather than
  type specific ("compressor").
- The service lists devices per appliance only, so the Devices page makes one request per appliance.
- A device's `lastSeenAt` and the appliance's `lastReadingAt` come from the service; "Current draw" is derived from a
  15-minute, one-minute-resolution readings query.
- Alert filter "Needs attention" is the service default (open and acknowledged); "All, with history" sends
  `includeResolved=true`; the other filters send `status`.
- The mock backfills seven days of readings for a newly registered device (the real service would show none until
  the device posts). Documented in the README.

## Not verified

- Appearance and layout in a real browser, dark mode by eye, and 375px width (only DOM/behaviour tests ran).
- Real-service mode with Firebase and the Spring backend.
- Screen reader behaviour (roles, names and keyboard paths are asserted in tests, not heard).
