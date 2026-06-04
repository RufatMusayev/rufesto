import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useCart } from '../../contexts/CartContext'
import { supabase } from '../../lib/supabase'

export default function Sidebar() {
  const { session } = useAuth()
  const { theme, toggle } = useTheme()
  const { tableId } = useCart()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!session) { setUnreadCount(0); return }
    const userId = session.user.id

    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
      .then(({ count }) => setUnreadCount(count || 0))

    const channel = supabase
      .channel('sidebar-notif-badge')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, () => {
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false)
          .then(({ count }) => setUnreadCount(count || 0))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session?.user?.id])

  return (
    <aside style={{
      position: 'fixed', left: 0, top: 0, bottom: 0,
      width: 'var(--sidebar-w)',
      background: 'var(--bg)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '20px',
      paddingBottom: '20px',
      zIndex: 90,
    }}>
      {/* Logo */}
      <div style={{
        marginBottom: '2rem',
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: '1.15rem', fontWeight: 700,
        fontStyle: 'italic', letterSpacing: -0.5,
        background: 'linear-gradient(135deg, var(--t1) 0%, var(--gold) 100%)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}>
        R
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        <SideItem to="/" label="Home" Icon={HomeIcon} />
        <SideItem to="/explore" label="Explore" Icon={SearchIcon} />
        <SideItem to="/map" label="Map" Icon={MapIcon} />
        <SideItem to="/notifications" label="Notifications" Icon={BellIcon} badge={unreadCount} />
        <SideItem to="/profile" label="Profile" Icon={ProfileIcon} />
        {tableId && <SideItem to="/table" label="Table" Icon={TableIcon} />}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'none', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--t3)', cursor: 'pointer',
            transition: 'background-color 0.2s ease, color 0.2s ease, transform 120ms cubic-bezier(0.23,1,0.32,1)',
          }}
          onPointerDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
          onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
          onPointerCancel={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--s3)'; e.currentTarget.style.color = 'var(--t1)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--t3)' }}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        <button
          title="More"
          style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'none', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--t3)', cursor: 'pointer',
            transition: 'background-color 0.2s ease, color 0.2s ease, transform 120ms cubic-bezier(0.23,1,0.32,1)',
          }}
          onPointerDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
          onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
          onPointerCancel={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--s3)'; e.currentTarget.style.color = 'var(--t1)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--t3)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>
    </aside>
  )
}

function SideItem({ to, label, Icon, badge = 0 }) {
  return (
    <NavLink to={to} end={to === '/'} title={label} style={({ isActive }) => ({
      width: 44, height: 44, borderRadius: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: isActive ? 'var(--accent)' : 'var(--t3)',
      transition: 'color 150ms, background 150ms',
      background: 'transparent',
      position: 'relative',
      borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
    })}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--s2)'; e.currentTarget.style.color = 'var(--t2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '' }}
    >
      {({ isActive }) => (
        <>
          <Icon filled={isActive} />
          {badge > 0 && (
            <span style={{
              position: 'absolute', top: 4, right: 4,
              minWidth: 14, height: 14, borderRadius: 100,
              background: 'var(--accent)', color: '#F5F0E8',
              fontSize: '0.55rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 3px',
              border: '2px solid var(--bg)',
            }}>
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function HomeIcon({ filled }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689z" fill="currentColor" />
      <path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432z"
        fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="1.5" />
    </svg>
  )
}

function SearchIcon({ filled }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={filled ? 2.5 : 1.8}>
      <circle cx="10.5" cy="10.5" r="7.5" />
      <line x1="16.5" y1="16.5" x2="22" y2="22" strokeLinecap="round" />
    </svg>
  )
}

function BellIcon({ filled }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={filled ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" fill={filled ? 'currentColor' : 'none'} />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function ProfileIcon({ filled }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0zM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

function MapIcon({ filled }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={filled ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill={filled ? 'currentColor' : 'none'} />
      <circle cx="12" cy="10" r="3" fill="none" />
    </svg>
  )
}

function TableIcon({ filled }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={filled ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M4 8V6a2 2 0 012-2h12a2 2 0 012 2v2" />
      <rect x="6" y="8" width="12" height="8" rx="1" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
    </svg>
  )
}
