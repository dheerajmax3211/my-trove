# API contracts

One JSON Schema (draft 2020-12) per response the workspace reads, one folder per service (`shared` is the Household
module's service). Each file names the record it mirrors and the endpoints that return it. 62 files, 7 services.

Both sides validate against these same files, so the demo mode (`?demo=1`, the in-memory mock APIs in
`ui-common/apps/*/src/mock/`) cannot drift from the real services:

- **Services:** `*ContractTest` in each service's tests (real HTTP through MockMvc, real Postgres via Testcontainers)
  validates the live JSON with `com.networknt:json-schema-validator` 3.0.6 (test scope; version pinned in the root
  `pom.xml`). Formats (`date-time`, `date`) are asserted.
- **Demo mocks:** `ui-common/apps/workspace/src/contracts/contracts.test.ts` calls each module's `createDemoFetch()`
  the way the workspace does and validates with a small validator in the same folder (`validate.ts`). It supports only
  the keywords these files use (`type`, `required`, `properties`, `additionalProperties`, `items`, `enum`, `const`,
  `format` date-time/date, `$ref` to `#/$defs/...` or a sibling file, `anyOf`) and throws on any other keyword, so a
  schema can never pass because a keyword was ignored. No validator is declared in `ui-common`, and adding one needs a
  lockfile change.

Rules: objects are closed (`additionalProperties: false`) and every field the service always sends is required, so a
missing or extra field fails on either side. Nullable fields use type arrays (`["string", "null"]`). Ask Your Life
omits null fields (`default-property-inclusion=non_null`), so its optional fields are not required and never null.
An empty JSON array fails the check: it would prove nothing about the elements.

Both halves run in the existing CI jobs (`./mvnw verify` and `pnpm test`); no separate job is needed.

When you change a response: change the schema here, then run the service's `*ContractTest` and
`npx vitest run apps/workspace/src/contracts` in `ui-common`, and fix whichever side disagrees.
