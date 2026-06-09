import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/source-sans-3/400.css'
import '@fontsource/source-sans-3/600.css'
import './index.css'
import App from './App.tsx'
import { initSentry, ErrorBoundary } from './sentry'
import { registerServiceWorker } from './registerSW'

initSentry()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={<p style={{ padding: 24 }}>Something went wrong. Please reload the page.</p>}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
