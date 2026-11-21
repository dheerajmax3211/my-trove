# Ask your life (`@platform/ask-your-life`)

One private search box across your own notes, documents and receipts. The service behind it
(`personal-platform/ask-your-life`, port 8086) runs a hybrid of keyword and semantic search and keeps every
user's content isolated; this app is its web front end.

## Screens

```
Sign in (RequireAuth gate; Google / email link)
└─ App shell: sidebar Search | Add content | Library, theme switch, sign out
   ├─ /          Search home
   │             - large search field, focused on arrival; "/" focuses it from anywhere
   │             - mode radio cards: Hybrid / Keyword / Semantic, each with a one-line explanation
   │             - Filters: source type (Note, File, Email, Receipt) and date added (from / to)
   │             - results: title, source badge, date, snippet with highlighted matches,
   │               "Why this result?" dialog, "Open in library"; "Show more results" (k += 10, max 50)
   │             - idle: example searches and tips; empty library: "Only you can see this" first-use card
   │             - no results: suggestions tailored to the mode and filters
   │             - state lives in the address (?q=&mode=&type=&from=&to=&k=), so it is shareable and back-button safe
   ├─ /add       Add content
   │             - tab "Paste a note" (title optional, Markdown body, kind, optional external ID)
   │             - tab "Upload a file" (.txt .md .html ..., multipart)
   │             - "Added this session": Saved -> Indexing -> Ready (or Failed), polled until done
   │             - duplicate, update (same external ID) and error messages (415, 413, 409, 400, offline)
   └─ /library   Library
                 - table: title, source, status, searchable passages, date added; filter by source; paging
                 - open an item (also /library?open=<id>): metadata and "Replace content" (PUT)
                 - delete with a confirmation dialog
```

Every screen has loading (skeletons or spinners), empty and error (readable message plus Try again) states.

## Run it

Demo mode needs nothing but this repo:

```
pnpm install
pnpm --filter @platform/ask-your-life dev      # http://localhost:5185
```

With no Firebase configuration the app starts in **demo mode**: a stub sign-in (already signed in as the demo
user; sign out and use "Continue with Google") and an in-memory mock of the real API, seeded with eight sample
documents. Things to try: search `smoke detector`, `"smoke detector" -paint` in Keyword mode, `vehicle cost` in
Semantic mode (finds the car invoice without the words), a note containing `FAIL-INDEXING` (ends as Failed), or
upload a PDF (answers 415 exactly like the service does today).

### Against the real backend

1. Start the service: `./mvnw -pl ask-your-life spring-boot:run` (see its README; needs Postgres with pgvector).
2. Configure Firebase in `.env.local` (see `.env.example`): either the emulator
   (`VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`) or a real project (`VITE_FIREBASE_API_KEY`,
   `VITE_FIREBASE_PROJECT_ID`, ...). The service must accept tokens for the same project.
3. `pnpm --filter @platform/ask-your-life dev`. Requests go to `/api/v1/...`; the Vite dev server proxies `/api`
   to `http://localhost:8086` and strips the `/api` prefix (the service has no context path).

### Environment variables

| Variable                                                                                                                                     | Meaning                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `VITE_USE_MOCK=true`                                                                                                                         | Force demo mode even when Firebase is configured.                                    |
| `VITE_FIREBASE_AUTH_EMULATOR_HOST`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_APP_ID` | Firebase Auth. Any of the emulator host, or key + project id, switches to real mode. |
| `VITE_API_BASE_URL`                                                                                                                          | API base URL. Default `/api` (proxied in dev). Set it for a deployed build.          |

Demo mode is used when `VITE_USE_MOCK=true` or Firebase is not configured. Otherwise the app runs in real mode.

## Checks

```
pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @platform/ask-your-life build
```

Tests live next to the code and run against the mock API through the real UI (Testing Library + user-event): search
in every mode, empty results, filters and the exact query string, highlight safety with hostile snippets, the "Why
this result" dialog, add note to ready to findable (including a stale cached search being refreshed), upload,
duplicate / update / unsupported (415) / too large (413) / failed indexing, delete with confirmation, library
paging and filtering, replace content, first-use and sign-out, the `/` shortcut. Pure logic (snippet parsing,
query building, explanations, validation, error mapping) and the mock's contract are unit-tested too.

## How the pieces map to the backend

| UI                    | Request                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Search                | `GET /v1/search?q=&k=&mode=&sourceType=&from=&to=&debug=true` (always `debug=true` for explain) |
| Paste a note          | `POST /v1/documents` JSON `{title?, text, sourceType, mimeType: "text/markdown", externalId?}`  |
| Upload                | `POST /v1/documents` multipart: `file`, `title?`, `sourceType`, `externalId?`                   |
| Library list / detail | `GET /v1/documents?sourceType=&limit=25&offset=`, `GET /v1/documents/{id}`                      |
| Replace content       | `PUT /v1/documents/{id}` `{title?, text}`                                                       |
| Delete                | `DELETE /v1/documents/{id}`                                                                     |

The date filter is "date added". An inclusive end date is sent as the start of the following local day, because
the service treats `to` as exclusive.

### Highlighting is safe by construction

The service returns snippets as escaped text with `<mark>` tags. The app never uses `dangerouslySetInnerHTML`:
`features/search/lib/snippet.ts` splits on the two literal tag strings, decodes entities in one pass, and
`components/Snippet.tsx` builds React `mark` elements and text nodes. Anything else that looks like markup stays
text, including escaped `&lt;mark&gt;`.

## What is mocked and what is real

- Real: the typed API layer, request shapes, error handling (`ApiError`), polling, caching and invalidation.
- Mocked in demo mode (`src/mock/`): the whole service. It reproduces the contract (paths, 202/200 outcomes, 400,
  401, 404, 409, 413 and 415 problem+json bodies, PENDING to INDEXED lifecycle, `<mark>` snippets, debug ranks), but
  its search is a small stand-in: stemmed keyword matching, a hand-written concept list for "semantic" and
  reciprocal rank fusion with k = 60. It says nothing about real relevance.

## Honest limitations

- **Status names.** The brief mentioned QUEUED / PROCESSING / READY / FAILED. The service reports `PENDING`,
  `INDEXED`, `FAILED`, so the app shows Indexing, Ready and Failed (there is no separate "processing" state to show).
- **No document text and no size.** The API returns metadata only: there is no endpoint to read a document's
  content and no byte size. "Open" therefore shows status, passages (chunk count), format, dates, external ID and a
  fingerprint, not the text. The Library shows passages rather than size.
- **PDF is not supported** by the service (415). The message says so and suggests pasting the text. The file picker
  does not offer PDFs, but a user can still choose one, and the server's answer is shown.
- Date filters use the browser's local day boundaries; the mock and real service may differ at the edges by time zone.
- Browser-level behaviour (real Firebase sign-in, the Vite proxy against the live service, visual layout and dark
  mode, the mobile drawer) has not been exercised by automated tests: jsdom has no layout.
- The production bundle is about 600 kB (187 kB gzipped), mostly Firebase pulled in by `@platform/auth-web`.
