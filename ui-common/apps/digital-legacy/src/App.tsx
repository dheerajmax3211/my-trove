import { ThemeProvider, ToastProvider, TooltipProvider } from '@platform/ui'
import { Route, Routes } from 'react-router-dom'
import { OwnerApp } from './OwnerApp'
import { TrusteeApp } from './TrusteeApp'
import { ClockProvider } from './lib/clock'
import type { Runtime } from './runtime'

/** Two route groups, two authentication schemes: `/trustee/*` is trustee-token only, the rest is the owner app. */
export function App({ runtime }: { runtime: Runtime }) {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <ToastProvider>
          <ClockProvider now={runtime.now}>
            <Routes>
              <Route path="/trustee/*" element={<TrusteeApp runtime={runtime} />} />
              <Route path="/*" element={<OwnerApp runtime={runtime} />} />
            </Routes>
          </ClockProvider>
        </ToastProvider>
      </TooltipProvider>
    </ThemeProvider>
  )
}
