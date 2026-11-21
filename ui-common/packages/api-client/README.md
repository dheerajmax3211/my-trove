# @platform/api-client

A small typed `fetch` wrapper for the platform's backend services, plus TanStack Query helpers.

```ts
import { createApiClient } from '@platform/api-client'
import { useAuth } from '@platform/auth-web'

const client = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  getToken: (forceRefresh) => auth.getIdToken(forceRefresh), // Firebase ID token
  onUnauthorized: () => auth.signOut(),
})

const items = await client.get<Item[]>('/items', { query: { status: 'open' } })
```

## Behavior

- **Bearer auth**: `Authorization: Bearer <ID token>` on every request (`auth: false` opts out).
- **401 => refresh once**: on a 401 the client calls `getToken(true)` and retries the request exactly once. A second
  401 (or no token after refresh) becomes an `ApiError` and calls `onUnauthorized`. No retry loops.
- **Errors are normalised** to `ApiError { status, type, title, detail, instance, extensions }`:
  RFC 7807 `application/problem+json` is parsed (extension members, e.g. validation `errors`, land in
  `extensions`); other JSON error bodies, plain text and empty bodies are handled; network failures become
  `status: 0` (`isNetworkError`); `AbortError` passes through untouched.
- Bodies: plain objects are sent as JSON; `FormData`, `Blob`, strings etc. as-is. `204` resolves `undefined`.

## React / TanStack Query

```tsx
;<ApiProvider client={client}>...</ApiProvider>

const { data, error } = useApiQuery<Item[]>('/items', { query: { status: 'open' } }) // error: ApiError | null
const create = useApiMutation<Item, NewItem>({
  path: '/items',
  invalidate: [apiQueryKey('/items')],
})
create.mutate({ name: 'x' })
```

`createApiQueryClient()` (used by `ApiProvider` by default) never retries 4xx responses and retries network/5xx
errors twice. `apiQueryOptions(client, path, query)` gives `queryOptions` for prefetching/loaders.

The client uses only `fetch`, `Headers` and `URLSearchParams`, so it also runs in React Native.
