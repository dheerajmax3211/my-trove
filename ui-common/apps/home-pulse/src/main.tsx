import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@platform/ui/styles.css'
import { App } from './App'
import { createRuntime } from './runtime'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

// Dialogs and toasts portal to <body>, outside the app's own root, so mark both with the product.
document.body.dataset.product = 'home-pulse'

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App runtime={createRuntime()} />
    </BrowserRouter>
  </StrictMode>,
)
