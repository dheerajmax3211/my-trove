import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@platform/ui/styles.css'
import { App } from './App'
import { createRuntime } from './runtime'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

function bootstrap() {
  try {
    const runtime = createRuntime()
    createRoot(root!).render(
      <StrictMode>
        <BrowserRouter>
          <App runtime={runtime} />
        </BrowserRouter>
      </StrictMode>,
    )
  } catch (error) {
    // A missing or half-filled Firebase config is the usual cause; say so instead of showing a blank page.
    const message = error instanceof Error ? error.message : String(error)
    root!.innerHTML = ''
    const box = document.createElement('main')
    box.className = 'ft-signin'
    box.setAttribute('role', 'alert')
    box.textContent = `Family Treasury could not start: ${message}`
    root!.append(box)
  }
}

bootstrap()
