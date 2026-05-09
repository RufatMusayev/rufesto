import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import CartSheet from '../CartSheet'
import CartFab from './CartFab'
import { useTheme } from '../../contexts/ThemeContext'

export default function AppLayout() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  const { theme, toggle } = useTheme()

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return (
    <div className="app-layout">
      {!isMobile && <Sidebar />}
      <div className="main-content">
        {isMobile && (
          <header style={{
            position: 'sticky', top: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px',
            height: 'var(--nav-h)',
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '1.35rem', fontWeight: 700, color: 'var(--t1)',
              fontStyle: 'italic',
              letterSpacing: -0.5,
            }}>DineBaku</span>

            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="icon-btn"
              style={{ width: 38, height: 38, color: 'var(--t1)' }}
            >
              {theme === 'dark' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4" />
                  <line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
                </svg>
              )}
            </button>
          </header>
        )}
        <Outlet />
      </div>
      {isMobile && <BottomNav />}
      <CartFab />
      <CartSheet />
    </div>
  )
}
