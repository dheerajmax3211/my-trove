import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@platform/ui/styles.css'
import { App } from './App'
import './app.css'
import { createRuntime } from './runtime'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App runtime={createRuntime()} />
    </BrowserRouter>
  </StrictMode>,
)
