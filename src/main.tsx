import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AuthRoot from './AuthRoot.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthRoot />
    <footer className="site-credit">
      <p>Made with <span className="site-credit-heart" role="img" aria-label="love">❤️</span> by <strong>Ronit &amp; Codex</strong></p>
    </footer>
  </StrictMode>,
)
