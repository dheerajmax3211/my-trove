import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@platform/ui/styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

// Placeholder from the Phase 2 pre-wiring; the real app is built in plan task 2.3.
createRoot(root).render(
  <StrictMode>
    <main>
      <h1>My-Trove workspace</h1>
    </main>
  </StrictMode>,
)
