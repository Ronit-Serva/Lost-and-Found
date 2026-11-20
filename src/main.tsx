import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AuthRoot from './AuthRoot.tsx'
import PrivacyPolicy from './PrivacyPolicy.tsx'
import './index.css'

const path = window.location.pathname.replace(/\/+$/, '') || '/'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {path === '/privacy' ? <PrivacyPolicy /> : <AuthRoot />}
    <footer className="site-credit">
      <p>Made with <span className="site-credit-heart" role="img" aria-label="love">❤️</span> by <strong>Ronit &amp; Codex</strong><span className="site-credit-divider" aria-hidden="true">·</span><a href="/privacy">Privacy</a></p>
    </footer>
  </StrictMode>,
)
