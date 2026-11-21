import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@platform/ui/styles.css'
import { App } from './App'
import './gallery.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
