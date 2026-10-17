import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import i18n from './lib/i18n'
import App from './App.jsx'

// <html lang> follows the UI language (screen readers, hyphenation, quotes): set at boot and on every switch.
const syncLang = lng => { document.documentElement.lang = String(lng || 'en').slice(0, 2) }
syncLang(i18n.resolvedLanguage || i18n.language)
i18n.on('languageChanged', syncLang)

// A deploy replaces the hashed chunk files: a tab opened before it can no longer fetch the chunk of a page it has not
// visited yet. Reload once (the new index.html points at the new files); the sessionStorage guard stops a loop if the
// server is down. Without storage there is no guard, so no automatic reload: the crash screen's Reload button is it.
window.addEventListener('vite:preloadError', () => {
  try {
    if (sessionStorage.getItem('rufesto_chunk_reload')) return
    sessionStorage.setItem('rufesto_chunk_reload', '1')
  } catch { return }
  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Safety net for public/boot.js (it switches the non-blocking fonts stylesheet on once loaded): if that script was
// blocked or failed, the fonts would never apply. After the first render nothing is waiting for the stylesheet.
document.getElementById('gf-css')?.setAttribute('media', 'all')
