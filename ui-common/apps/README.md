# apps/

Three runnable apps and seven product modules.

- `workspace` (dev port 5190): the signed-in My-Trove app. It hosts every product as a module under
  `/app/<id>`, the account and developer pages, the admin console (`@platform/admin-console`), and Digital Legacy's
  public trustee portal at `/trustee`. `?demo=1` is a zero-setup demo mode: a stub identity and each module's
  in-memory mock API, never the network.
  The **Trove Assistant** (`workspace/src/assistant`, header "Ask" button and ⌘K "Ask the assistant", shown only with
  `mcp:use`) answers a question by calling one MCP tool through the gateway (`POST /api/mcp/mcp`, the person's own
  token). There is no language model: fixed word rules (`intent.ts`, tested) pick Waiting On, Home Pulse or Family
  Treasury, and anything else is an Ask Your Life search. In demo mode the same tools are answered from the products'
  mock APIs.
- `site` (5191): the public site.
- `gallery`: living documentation of the design system (`pnpm dev` at the root).

Product modules, each a package that the workspace imports and bundles from source (no Vite app, no dev server,
no `build` script of its own): `waiting-on`, `consent`, `home-pulse`, `ask-your-life`, `digital-legacy`,
`family-treasury` and `hub` (whose `core` module is the Household area: households, reminders, files, activity).
Each exports `productModule` from `@platform/<product>/module`; Digital Legacy also exports its trustee portal from
`@platform/digital-legacy/trustee`. The standalone product apps that used to run on ports 5181-5187 were retired
on 2026-11-26: the workspace replaces all of them.

## Adding a product module (example: `apps/waiting-on`)

1. **Create the folder**:

   ```
   apps/waiting-on/
   ├── package.json        name "@platform/waiting-on", "private": true, scripts { typecheck },
   │                       exports { "./module": "./src/module.tsx" }
   ├── tsconfig.json       extends ../../tsconfig.base.json; "types": ["vite/client", "@testing-library/jest-dom/vitest"]
   └── src/
       ├── module.tsx      export const productModule: ProductModule (from @platform/workspace-kit)
       ├── routes.tsx      the pages, with module-relative paths; imports the module's CSS
       ├── mock/           an in-memory mock of the service, for createDemoFetch and the tests
       └── features/       one folder per feature (screens, hooks, api calls)
   ```

2. **Depend on the packages** (exact versions for third-party deps, `workspace:*` for ours), then run `pnpm install`
   and add the package to `apps/workspace/package.json` and `apps/workspace/src/modules/registry.ts`. Use the same
   versions as the rest of the workspace (`pnpm check:versions` enforces this).

3. **Fill in `ProductModule`**: `id`, `service` (the gateway route: the module's API client is bound to
   `<gateway>/api/<service>`, so paths start at `/v1`), `title`, `nav` (module-relative), `Routes`, and optionally
   `Providers` (product-only context), `useTodayItems` and `createDemoFetch`. The workspace supplies sign-in, the
   session (`useWorkspaceSession`), the API client and query cache, theme, toasts and the router.

4. **Conventions**
   - Style only with `@platform/ui` components and `--pp-*` token variables; no raw colors, no new UI libraries.
     Missing component? Add it to `@platform/ui` (with tests and a gallery page) rather than building it locally.
   - Call the backend only through `useApiQuery` / `useApiMutation` / the shared client, so auth headers, token
     refresh and `ApiError` handling stay uniform.
   - Link with `ModuleLink` / `ModuleNavLink` / `useModulePath`, never absolute paths, so the module works under
     any base.
   - Tests live next to the code (`*.test.tsx`) and are picked up by the root `vitest` run. Mount the module the
     way the workspace does (each product's `src/test*/` helper shows how: the workspace's providers around
     `productModule.Providers` and `productModule.Routes`, against the module's mock).
   - Run it with `dev/web.sh workspace` and open http://localhost:5190/app/waiting-on (or `?demo=1`).
