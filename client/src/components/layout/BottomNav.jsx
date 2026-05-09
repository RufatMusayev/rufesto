import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useCart } from '../../contexts/CartContext'
import AuthModal from '../AuthModal'
import QRSheet from '../QRSheet'

export default function BottomNav() {
  const { session, isStaff } = useAuth()
  const { tableId } = useCart()
  const navigate = useNavigate()
  const [sheet, setSheet] = useState(null)

  function handleQRPress() {
    if (!session) { setSheet('auth');  return }
    if (tableId)  { navigate('/table'); return }
    setSheet('qr')
  }

  function handleProfilePress(e) {
    if (!session) { e.preventDefault(); setSheet('auth') }
  }

  return (
    <>
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 'var(--bottom-h)',
        background: 'var(--bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        zIndex: 90,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>

        <NavItem to="/" label="Home">
          {a => <HomeIcon filled={a} />}
        </NavItem>

        <NavItem to="/explore" label="Explore">
          {a => <SearchIcon filled={a} />}
        </NavItem>

        {/* QR / Table center button */}
        <div style={{ flex: '0 0 56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button
            onClick={handleQRPress}
            aria-label={tableId ? 'Active table' : 'Scan QR'}
            style={{
              position: 'relative', top: -16,
              width: 52, height: 52, borderRadius: '50%',
              background: tableId ? 'var(--green)' : 'var(--accent)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: tableId
                ? '0 4px 15px rgba(34,197,94,0.4)'
                : '0 4px 15px rgba(245,158,11,0.4)',
              transition: 'transform 0.15s',
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            {tableId ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0c0a09" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M4 8V6a2 2 0 012-2h12a2 2 0 012 2v2"/>
                <rect x="6" y="8" width="12" height="8" rx="1"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0c0a09" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="5" y="5" width="3" height="3" fill="#0c0a09" stroke="none"/>
                <rect x="16" y="5" width="3" height="3" fill="#0c0a09" stroke="none"/>
                <rect x="5" y="16" width="3" height="3" fill="#0c0a09" stroke="none"/>
                <path d="M14 14h2v2h-2zM18 14h3M18 18v3M14 18h2v2"/>
              </svg>
            )}
          </button>
        </div>

        <NavItem to="/notifications" label="Activity">
          {a => <HeartIcon filled={a} />}
        </NavItem>

        <NavLink
          to={isStaff ? '/dashboard' : '/profile'}
          onClick={handleProfilePress}
          end={false}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem 0' }}
        >
          {({ isActive }) => (
            <ProfileIcon filled={isActive && !!session} />
          )}
        </NavLink>
      </nav>

      {sheet === 'auth'  && <AuthModal  onClose={() => setSheet(null)} />}
      {sheet === 'qr'    && <QRSheet    onClose={() => setSheet(null)} />}
    </>
  )
}

function NavItem({ to, label, children }) {
  return (
    <NavLink to={to} end={to === '/'} aria-label={label}
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem 0' }}>
      {({ isActive }) => children(isActive)}
    </NavLink>
  )
}

function HomeIcon({ filled }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: filled ? 'var(--t1)' : 'var(--t3)', transition: 'color 0.15s' }}>
      <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689z" fill="currentColor"/>
      <path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432z" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="1.5"/>
    </svg>
  )
}

function SearchIcon({ filled }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={filled ? 'var(--t1)' : 'var(--t3)'} strokeWidth={filled ? 2.5 : 1.8} style={{ transition: 'stroke 0.15s' }}>
      <circle cx="10.5" cy="10.5" r="7.5" strokeLinecap="round"/>
      <line x1="16.5" y1="16.5" x2="22" y2="22" strokeLinecap="round"/>
    </svg>
  )
}

function HeartIcon({ filled }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={filled ? 'var(--red)' : 'none'} stroke={filled ? 'var(--red)' : 'var(--t3)'} strokeWidth="1.8" style={{ transition: 'all 0.15s' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"/>
    </svg>
  )
}

function ProfileIcon({ filled }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={filled ? 'var(--t1)' : 'var(--t3)'} strokeWidth="1.8" style={{ transition: 'stroke 0.15s' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0zM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}
