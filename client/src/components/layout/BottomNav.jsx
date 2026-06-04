import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useCart } from '../../contexts/CartContext'
import AuthModal from '../AuthModal'
import QRSheet from '../QRSheet'

export default function BottomNav() {
  const { session } = useAuth()
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
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
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
        <div style={{ flex: '0 0 60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button
            onClick={handleQRPress}
            aria-label={tableId ? 'Active table' : 'Scan QR'}
            style={{
              position: 'relative', top: -18,
              width: 54, height: 54, borderRadius: '50%',
              background: tableId ? 'var(--sage)' : 'var(--accent)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: tableId
                ? '0 4px 16px rgba(77,124,63,0.45)'
                : '0 4px 16px rgba(139,45,66,0.45)',
              transition: 'transform 120ms cubic-bezier(0.23,1,0.32,1), background-color 200ms ease',
              touchAction: 'manipulation',
            }}
            onPointerDown={e => e.currentTarget.style.transform = 'scale(0.93)'}
            onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
            onPointerCancel={e => e.currentTarget.style.transform = 'scale(1)'}
            onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            {tableId ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F5F0E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M4 8V6a2 2 0 012-2h12a2 2 0 012 2v2"/>
                <rect x="6" y="8" width="12" height="8" rx="1"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1A1210" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="5" y="5" width="3" height="3" fill="#1A1210" stroke="none"/>
                <rect x="16" y="5" width="3" height="3" fill="#1A1210" stroke="none"/>
                <rect x="5" y="16" width="3" height="3" fill="#1A1210" stroke="none"/>
                <path d="M14 14h2v2h-2zM18 14h3M18 18v3M14 18h2v2"/>
              </svg>
            )}
          </button>
        </div>

        <NavItem to="/map" label="Map">
          {a => <MapIcon filled={a} />}
        </NavItem>

        <NavLink
          to="/profile"
          onClick={handleProfilePress}
          end={false}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.4rem 0' }}
        >
          {({ isActive }) => (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <ProfileIcon filled={isActive && !!session} />
              <div className={`nav-dot${isActive ? ' active' : ''}`} />
            </div>
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
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.4rem 0' }}>
      {({ isActive }) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          {children(isActive)}
          <div className={`nav-dot${isActive ? ' active' : ''}`} />
        </div>
      )}
    </NavLink>
  )
}

function HomeIcon({ filled }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: filled ? 'var(--t1)' : 'var(--t3)', transition: 'color 150ms' }}>
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

function MapIcon({ filled }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={filled ? 'var(--t1)' : 'var(--t3)'} strokeWidth={filled ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke 0.15s' }}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill={filled ? 'currentColor' : 'none'} />
      <circle cx="12" cy="10" r="3" stroke={filled ? 'var(--bg)' : 'var(--t3)'} fill="none" />
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
