import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@platform/ui/styles.css'
import { App } from './App'
import { createRuntime } from './runtime'
import './app.css'
import './switch.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

const runtime = createRuntime({ latencyMs: 150 })

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App runtime={runtime} />
    </BrowserRouter>
  </StrictMode>,
)
