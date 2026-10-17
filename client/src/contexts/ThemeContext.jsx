import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

const KEY = 'rufesto_theme'
// the browser UI colour (address bar, task switcher) follows the page background of the active theme
const BROWSER_COLOR = { dark: '#1A1210', light: '#F5F0E8' }

/** The guest's own choice (made with the toggle), or null while they have not made one. */
function storedTheme() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch { return null }
}

const lightQuery = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: light)')
  : null)

/**
 * Theme: the guest's saved choice wins; until they toggle, the first visit follows the operating system's colour
 * scheme (and keeps following it if it changes). Only the toggle writes localStorage, so the OS default is never frozen
 * into a "choice". public/boot.js applies the same rule before the first paint.
 */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => storedTheme() || (lightQuery()?.matches ? 'light' : 'dark'))
  const [chosen, setChosen] = useState(() => storedTheme() !== null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BROWSER_COLOR[theme])
  }, [theme])

  useEffect(() => {
    const mq = lightQuery()
    if (chosen || !mq?.addEventListener) return undefined
    const follow = () => setTheme(mq.matches ? 'light' : 'dark')
    mq.addEventListener('change', follow)
    return () => mq.removeEventListener('change', follow)
  }, [chosen])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setChosen(true)
    try { localStorage.setItem(KEY, next) } catch { /* storage blocked: the choice lasts for this visit */ }
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
