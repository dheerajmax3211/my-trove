# Handoff: ask-your-life

## Component candidates for `packages/ui`

Built inside the app because the kit lacks them (see `src/components/` and `src/features/*/components/`):

- **Snippet highlighter** (`components/Snippet.tsx` + `features/search/lib/snippet.ts`): safe rendering of text with
  `<mark>` markers (no `dangerouslySetInnerHTML`, unit-tested with hostile input). Useful to any app showing search hits.
- **Radio-card group** (`features/search/components/ModeToggle.tsx`): native radios styled as selectable cards with a
  one-line description. A kit "SegmentedControl / RadioCard" would cover it.
- **Step progress** (`features/documents/components/IngestProgress.tsx`): Saved / Indexing / Ready pills with
  `aria-current="step"`.
- **Callout** (`.ayl-callout` in `app.css`): inline danger/info message box with a heading line. Currently only a CSS class.
- **Popover**: "Why this result" uses `Dialog` because the kit has no Popover. A real anchored popover would suit it better.
- **`kbd` styling and a `/` shortcut hook** (`lib/useSlashShortcut.ts`): the hook ignores text fields and dialogs.

## Dependency notes

- No new third-party dependencies. Exact versions match the workspace (`pnpm lint` runs `check-versions`).
- `@platform/tokens` is listed like in the gallery's `package.json`; the app only uses its CSS through `@platform/ui/styles.css`.
- `pnpm --filter "@platform/ask-your-life..." build` is needed once so dependent packages have a `dist`; `vite build`
  resolves workspace packages from `dist`.

## Assumptions and facts to verify

- **Proxy:** the service has no context path (endpoints start at `/v1`), so the dev proxy rewrites `/api/*` to `/*`
  on `http://localhost:8086`. A deployed build must put a gateway at `VITE_API_BASE_URL` that does the same.
- **Status vocabulary:** UI uses Indexing / Ready / Failed for `PENDING` / `INDEXED` / `FAILED` (the brief's QUEUED and
  PROCESSING do not exist in the API).
- **Validation errors:** the service's 400s for bad bodies are plain Spring problem+json without per-field `errors`,
  so field validation is done client-side (mirroring `@NotBlank`, `@Size(500)`, `@Size(256)`) and server messages are
  shown as a banner. If the service later adds field errors, map them in `describeIngestError`.
- **Search always sends `debug=true`**, so each hit carries ranks for "Why this result". Cheap on the server today;
  switch to `/v1/search/explain` on demand if that changes.
- **List order** is assumed newest first (the table also sorts client-side by "Added" descending by default).
- **Library paging** uses `limit=25` and a "Next" button enabled when a full page came back (the API has no total).
- The Library has no "re-ingest by external id" screen of its own: updating by external ID is done from Add content
  (Advanced), and "Replace content" uses `PUT /v1/documents/{id}`.
- Mock-only trigger: text containing `FAIL-INDEXING` ends as `FAILED` so the failure UI can be seen in demo mode.
- Toasts and Radix: while a toast is on screen, Escape closes the toast before an open dialog (Radix layering).
