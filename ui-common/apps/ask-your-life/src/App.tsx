import { ApiProvider } from '@platform/api-client'
import { AuthProvider, RequireAuth } from '@platform/auth-web'
import { Spinner, ThemeProvider, ToastProvider } from '@platform/ui'
import type { QueryClient } from '@tanstack/react-query'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { SignIn } from './components/SignIn'
import { AddPage } from './features/documents/pages/AddPage'
import { LibraryPage } from './features/documents/pages/LibraryPage'
import { SearchPage } from './features/search/pages/SearchPage'
import { DEFAULT_SETTINGS, SettingsProvider, type AppSettings } from './lib/settings'
import type { Runtime } from './runtime'

export interface AppProps {
  runtime: Runtime
  settings?: AppSettings
  /** Tests pass a QueryClient that never retries. */
  queryClient?: QueryClient
}

/** Everything inside the router: providers, the sign-in gate, the shell and the three screens. */
export function App({ runtime, settings = DEFAULT_SETTINGS, queryClient }: AppProps) {
  return (
    <ThemeProvider>
      <AuthProvider client={runtime.authClient}>
        <ApiProvider client={runtime.apiClient} {...(queryClient ? { queryClient } : {})}>
          <ToastProvider>
            <SettingsProvider value={settings}>
              <RequireAuth
                loading={
                  <div className="ayl-signin">
                    <Spinner size={32} label="Checking your session" />
                  </div>
                }
                fallback={<SignIn mode={runtime.mode} />}
              >
                <Routes>
                  <Route element={<Shell />}>
                    <Route index element={<SearchPage />} />
                    <Route path="add" element={<AddPage />} />
                    <Route path="library" element={<LibraryPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
              </RequireAuth>
            </SettingsProvider>
          </ToastProvider>
        </ApiProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
