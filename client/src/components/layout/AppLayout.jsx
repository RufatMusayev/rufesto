import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import CartSheet from '../CartSheet'
import CartFab from './CartFab'
import AIFab from './AIFab'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

export default function AppLayout() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  const [unreadCount, setUnreadCount] = useState(0)
  const { theme, toggle } = useTheme()
  const { session } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    if (!session) { setUnreadCount(0); return }
    const userId = session.user.id

    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)
      .then(({ count }) => setUnreadCount(count || 0))

    const channel = supabase
      .channel('notif-badge')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, () => {
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('read', false)
          .then(({ count }) => setUnreadCount(count || 0))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session?.user?.id])

  const headerBg = theme === 'dark'
    ? 'rgba(26,18,16,0.88)'
    : 'rgba(245,240,232,0.92)'

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
            background: headerBg,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderBottom: '1px solid var(--border)',
            transition: 'background-color 200ms ease',
          }}>
            <span style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '1.4rem', fontWeight: 700,
              fontStyle: 'italic', letterSpacing: -0.5,
              background: 'linear-gradient(135deg, var(--t1) 0%, var(--gold) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>Rufesto</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => navigate('/notifications')}
                aria-label="Notifications"
                className="icon-btn"
                style={{ width: 38, height: 38, color: 'var(--t1)', position: 'relative' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: 4, right: 4,
                    minWidth: 16, height: 16, borderRadius: 100,
                    background: 'var(--accent)', color: '#F5F0E8',
                    fontSize: '0.6rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px',
                    border: '2px solid var(--bg)',
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

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
            </div>
          </header>
        )}
        <Outlet />
      </div>
      {isMobile && <BottomNav />}
      <AIFab />
      <CartFab />
      <CartSheet />
    </div>
  )
}
