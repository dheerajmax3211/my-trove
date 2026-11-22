import { AuthProvider, RequireAuth, useAuth } from '@platform/auth-web'
import { ThemeProvider, ToastProvider } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'
import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ScreenMessage } from './components/ScreenMessage'
import { ModuleRoute } from './modules/ModuleRoute'
import { createRuntimeStore } from './modules/runtimeStore'
import { registry } from './modules/registry'
import { OnboardingProvider, useOnboarding } from './onboarding/OnboardingProvider'
import { OnboardingWizard } from './onboarding/OnboardingWizard'
import { AccountPage } from './pages/account/AccountPage'
import { DeveloperArea } from './developer/DeveloperArea'
import { HomePage } from './pages/home/HomePage'
import { SignInPage } from './pages/signin/SignInPage'
import { NotFoundPage } from './pages/StatusPages'
import { createRuntime, type Runtime } from './runtime'
import { WorkspaceShell } from './shell/WorkspaceShell'
import { WorkspaceContext } from './workspace/context'
import { SessionGate } from './workspace/SessionGate'

function WorkspaceRoutes() {
  const onboarding = useOnboarding()
  if (onboarding.open) return <OnboardingWizard />
  return (
    <Routes>
      <Route element={<WorkspaceShell />}>
        <Route index element={<HomePage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="developer/*" element={<DeveloperArea />} />
        <Route path="app/:id/*" element={<ModuleRoute />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

/**
 * Everything that exists only while someone is signed in. The caller keys it by the user's id, so a
 * different user (or a sign-out) throws away every API client, query cache and piece of state.
 */
function SignedIn({ runtime, modules }: { runtime: Runtime; modules: readonly ProductModule[] }) {
  const [store] = useState(() => createRuntimeStore(runtime, runtime.authClient))
  useEffect(() => () => store.clear(), [store])
  return (
    <WorkspaceContext value={{ runtime, store, modules }}>
      <SessionGate>
        <OnboardingProvider>
          <WorkspaceRoutes />
        </OnboardingProvider>
      </SessionGate>
    </WorkspaceContext>
  )
}

function Gate({ runtime, modules }: { runtime: Runtime; modules: readonly ProductModule[] }) {
  const { user } = useAuth()
  return (
    <RequireAuth
      loading={<ScreenMessage busy title="Checking your session" />}
      fallback={<SignInPage runtime={runtime} modules={modules} />}
    >
      <SignedIn key={user?.uid ?? 'anonymous'} runtime={runtime} modules={modules} />
    </RequireAuth>
  )
}

/**
 * The workspace. Mount it inside a Router. Pass a `runtime` to control auth and transport and
 * `modules` to host something other than the real registry (tests do both).
 */
export function App({
  runtime: provided,
  modules = registry,
}: {
  runtime?: Runtime
  modules?: readonly ProductModule[]
}) {
  const [runtime] = useState(() => provided ?? createRuntime())
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider client={runtime.authClient}>
          <Gate runtime={runtime} modules={modules} />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
