# apps/

One folder per product web app. Each is its own Vite + React SPA that **depends on the shared packages and
contains only product code**: routes, screens, domain hooks and copy. Nothing generic belongs here; if a second
product needs it, move it to `packages/`.

Apps today: `gallery` (living documentation and the reference for the wiring below) and one app per product:
`hub` (5181), `waiting-on` (5182), `consent` (5183), `home-pulse` (5184), `ask-your-life` (5185),
`digital-legacy` (5186) and `family-treasury` (5187). Each runs in a zero-setup demo mode (stub sign-in plus an
in-memory mock of its backend) with `pnpm --filter @platform/<app> dev`; see the app's own README for real mode.

## Adding a product app (example: `apps/waiting-on`)

1. **Create the folder** with the same shape as the gallery:

   ```
   apps/waiting-on/
   ├── package.json        name "@platform/waiting-on", "private": true, scripts dev/build/typecheck
   ├── index.html          copy the theme-flash inline script from apps/gallery/index.html
   ├── vite.config.ts      react() + the dev-only '@platform/source' condition (copy from gallery)
   ├── tsconfig.json       extends ../../tsconfig.base.json; "types": ["vite/client", "@testing-library/jest-dom/vitest"]
   ├── .env.example        VITE_FIREBASE_* and VITE_API_BASE_URL
   └── src/
       ├── main.tsx        import '@platform/ui/styles.css' first
       ├── App.tsx         providers + routes
       └── features/       one folder per feature (screens, hooks, api calls)
   ```

2. **Depend on the packages** (exact versions for third-party deps, `workspace:*` for ours), then run `pnpm install`:

   ```json
   "dependencies": {
     "@platform/api-client": "workspace:*",
     "@platform/auth-web": "workspace:*",
     "@platform/ui": "workspace:*",
     "@tanstack/react-query": "5.108.0",
     "react": "19.3.1",
     "react-dom": "19.3.1",
     "react-router-dom": "7.18.6"
   }
   ```

   Use the same versions as the rest of the workspace (`pnpm check:versions` enforces this).

3. **Wire the providers** once in `App.tsx` (see `apps/gallery/src/demo/DemoApp.tsx` for a running example):

   ```tsx
   const auth = createFirebaseAuthClient(getFirebaseConfigFromEnv(import.meta.env))
   const api = createApiClient({
     baseUrl: import.meta.env.VITE_API_BASE_URL,
     getToken: (force) => auth.getIdToken(force),
     onUnauthorized: () => void auth.signOut(),
   })

   <ThemeProvider>
     <AuthProvider client={auth}>
       <ApiProvider client={api}>
         <ToastProvider>
           <RequireAuth loading={<Spinner />} fallback={<SignIn />}>
             <AppShell ...>{routes}</AppShell>
           </RequireAuth>
         </ToastProvider>
       </ApiProvider>
     </AuthProvider>
   </ThemeProvider>
   ```

4. **Conventions**
   - Style only with `@platform/ui` components and `--pp-*` token variables; no raw colors, no new UI libraries.
     Missing component? Add it to `@platform/ui` (with tests and a gallery page) rather than building it locally.
   - Call the backend only through `useApiQuery` / `useApiMutation` / the shared client, so auth headers, token
     refresh and `ApiError` handling stay uniform.
   - Gate routes with `RequireAuth`. Local dev uses the Firebase Auth emulator (`VITE_FIREBASE_AUTH_EMULATOR_HOST`).
   - Tests live next to the code (`*.test.tsx`) and are picked up automatically by the root `vitest` run.
   - Root `pnpm dev` runs the gallery; run a product app with `pnpm --filter @platform/waiting-on dev`.
   - `pnpm build` at the root builds every package then every app; keep each app's build green.
