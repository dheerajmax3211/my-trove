import { ApiProvider } from '@platform/api-client'
import { AuthProvider, RequireAuth, useAuth } from '@platform/auth-web'
import { Spinner, ThemeProvider, ToastProvider } from '@platform/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { SignIn } from './auth/SignIn'
import { ClockProvider } from './lib/clock'
import { AppLayout } from './layout/AppLayout'
import { ItemDetailPage } from './features/items/pages/ItemDetailPage'
import { ItemsPage } from './features/items/pages/ItemsPage'
import { NewItemPage } from './features/items/pages/NewItemPage'
import { NotFoundPage } from './features/items/pages/NotFoundPage'
import { createRuntime, type Runtime } from './runtime'

/** Cached items belong to one user: drop them whenever the signed-in user changes or signs out. */
function ClearCacheOnUserChange() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const previous = useRef(user?.uid)
  useEffect(() => {
    if (previous.current !== user?.uid) queryClient.clear()
    previous.current = user?.uid
  }, [user?.uid, queryClient])
  return null
}

/** Providers and routes. Mount inside a Router. Pass a `runtime` to control auth, API and clock (tests do). */
export function App({ runtime: provided }: { runtime?: Runtime }) {
  const [runtime] = useState(() => provided ?? createRuntime())
  return (
    <ThemeProvider>
      <ClockProvider clock={runtime.clock}>
        <AuthProvider client={runtime.authClient}>
          <ApiProvider
            client={runtime.apiClient}
            {...(runtime.queryClient ? { queryClient: runtime.queryClient } : {})}
          >
            <ClearCacheOnUserChange />
            <ToastProvider>
              <RequireAuth
                loading={
                  <div className="wo-signin">
                    <Spinner size={32} label="Checking your session" />
                  </div>
                }
                fallback={<SignIn demo={runtime.demo} />}
              >
                <Routes>
                  <Route element={<AppLayout demo={runtime.demo} />}>
                    <Route index element={<ItemsPage />} />
                    <Route path="new" element={<NewItemPage />} />
                    <Route path="items/:id" element={<ItemDetailPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </RequireAuth>
            </ToastProvider>
          </ApiProvider>
        </AuthProvider>
      </ClockProvider>
    </ThemeProvider>
  )
}
