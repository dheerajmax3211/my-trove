# Ask your life (`@platform/ask-your-life`)

One private search box across your own notes, documents and receipts. The service behind it
(`personal-platform/ask-your-life`, port 8086) runs a hybrid of keyword and semantic search and keeps every
user's content isolated; this module is its web front end inside the workspace.

## In the workspace

The product is a workspace module (`src/module.tsx`, exported as `@platform/ask-your-life/module`). The workspace
mounts `productModule.Routes` under `/app/ask-your-life`, wraps it in `productModule.Providers`, and gives it an API
client bound to `<gateway>/api/ask-your-life` with its own query cache. Every link goes through `ModuleLink` /
`useModuleNavigate`, so the screens work under any base. The module adds a
Today feed (`useTodayItems`: documents that failed to index or are still indexing, each linking to the library) and
`createDemoFetch` (the in-memory mock API below, which answers both `/api/v1/...` and `/api/ask-your-life/v1/...`).
Recent searches are kept in this browser only (`localStorage`, per signed-in user) and can be cleared from the home.

## Screens

```
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

This package has no app or dev server of its own: the workspace mounts it at `/app/ask-your-life`.

```
dev/web.sh workspace     # http://localhost:5190/app/ask-your-life; add ?demo=1 for the in-memory mock (no backend)
```

Live mode needs the dev stack (`dev/up.sh`, gateway on :8080): the workspace's API client calls
`<gateway>/api/ask-your-life/v1/...`. Sign-in and `VITE_*` configuration belong to the workspace (`apps/workspace`).
The workspace's demo mode uses an in-memory mock of the real API seeded with eight sample documents. Things to try:
search `smoke detector`, `"smoke detector" -paint` in Keyword mode, `vehicle cost` in Semantic mode (finds the car
invoice without the words), a note containing `FAIL-INDEXING` (ends as Failed), or upload a PDF (answers 415 exactly
like the service does today).
Checks, from `ui-common`: `pnpm lint && pnpm typecheck && pnpm test`; the module is bundled by
`pnpm --filter @platform/workspace build`.

## Tests

Tests live next to the code and mount the module as the workspace does, against the mock API, through the real UI (Testing Library + user-event): search
in every mode, empty results, filters and the exact query string, highlight safety with hostile snippets, the "Why
this result" dialog, add note to ready to findable (including a stale cached search being refreshed), upload,
duplicate / update / unsupported (415) / too large (413) / failed indexing, delete with confirmation, library
paging and filtering, replace content, first use, the `/` shortcut. Pure logic (snippet parsing,
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
  its search is a small imitation: stemmed keyword matching, a hand-written concept list for "semantic",
  reciprocal rank fusion with k = 60, and a quoted `answer` picked the same way the service picks it (best sentence of
  the top three passages). It says nothing about real relevance; the real service runs a local Model2Vec model.

### The quoted answer

`SearchResponse.answer` (when present) is shown above the results by `features/search/components/AnswerCard.tsx` as
"From your documents", each sentence quoted verbatim with a link to its document and passage number, and a note that
it is quoted, not written by an AI. It is plain text, rendered as React text nodes.

## Honest limitations

- **Status names.** The brief mentioned QUEUED / PROCESSING / READY / FAILED. The service reports `PENDING`,
  `INDEXED`, `FAILED`, so the app shows Indexing, Ready and Failed (there is no separate "processing" state to show).
- **No document text and no size.** The API returns metadata only: there is no endpoint to read a document's
  content and no byte size. "Open" therefore shows status, passages (chunk count), format, dates, external ID and a
  fingerprint, not the text. The Library shows passages rather than size.
- **PDF is not supported** by the service (415). The message says so and suggests pasting the text. The file picker
  does not offer PDFs, but a user can still choose one, and the server's answer is shown.
- Date filters use the browser's local day boundaries; the mock and real service may differ at the edges by time zone.
- Browser-level behaviour (real sign-in, the live service, visual layout and dark mode) is not exercised by these
  unit tests: jsdom has no layout. The workspace's `dev/qa/` scripts cover the module in a real browser.
