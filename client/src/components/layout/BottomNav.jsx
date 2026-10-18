import { lazy, Suspense, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useCart } from '../../contexts/CartContext'
import AuthModal from '../AuthModal'
import { warmSearch } from '../../features/search/warm'

// the scanner (html5-qrcode is ~100 kB) is fetched when the guest first taps the QR button
const QRSheet = lazy(() => import('../QRSheet'))

// Phones and tablets (below 1024 px). The active tab is a filled icon, nothing else (docs/UX-PLAN-2026-10-18.md 1.1).
// Styles: layout.css.
export default function BottomNav() {
  const { session } = useAuth()
  const { tableId } = useCart()
  const navigate = useNavigate()
  const [sheet, setSheet] = useState(null)
  const { t } = useTranslation('nav')

  function handleQRPress() {
    if (!session) { setSheet('auth');  return }
    if (tableId)  { navigate('/table'); return }
    setSheet('qr')
  }

  return (
    <>
      <nav className="bottom-nav" aria-label={t('home')}>
        <NavItem to="/" label={t('home')}>
          {a => <HomeIcon filled={a} />}
        </NavItem>

        <NavItem to="/explore" label={t('search')} onWarm={warmSearch}>
          {a => <SearchIcon filled={a} />}
        </NavItem>

        {/* QR / Table center button */}
        <div className="bottom-nav-qr-slot">
          <button
            type="button"
            onClick={handleQRPress}
            aria-label={tableId ? t('activeTable') : t('scanQR')}
            className={`bottom-nav-qr pressable${tableId ? ' is-seated' : ''}`}
          >
            {tableId ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F5F0E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M4 8V6a2 2 0 012-2h12a2 2 0 012 2v2"/>
                <rect x="6" y="8" width="12" height="8" rx="1"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F5F0E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="5" y="5" width="3" height="3" fill="#F5F0E8" stroke="none"/>
                <rect x="16" y="5" width="3" height="3" fill="#F5F0E8" stroke="none"/>
                <rect x="5" y="16" width="3" height="3" fill="#F5F0E8" stroke="none"/>
                <path d="M14 14h2v2h-2zM18 14h3M18 18v3M14 18h2v2"/>
              </svg>
            )}
          </button>
        </div>

        <NavItem to="/map" label={t('map')}>
          {a => <MapIcon filled={a} />}
        </NavItem>

        <NavLink to="/profile" aria-label={t('profile')} end={false}>
          {({ isActive }) => <ProfileIcon filled={isActive && !!session} />}
        </NavLink>
      </nav>

      {sheet === 'auth'  && <AuthModal  onClose={() => setSheet(null)} />}
      {sheet === 'qr'    && <Suspense fallback={null}><QRSheet onClose={() => setSheet(null)} /></Suspense>}
    </>
  )
}

function NavItem({ to, label, onWarm, children }) {
  return (
    <NavLink
      to={to} end={to === '/'} aria-label={label}
      onPointerDown={onWarm} onTouchStart={onWarm} onMouseEnter={onWarm}
    >
      {({ isActive }) => children(isActive)}
    </NavLink>
  )
}

function HomeIcon({ filled }) {
  return (
    <svg className="bn-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689z" fill="currentColor"/>
      <path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432z" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="1.5"/>
    </svg>
  )
}

function SearchIcon({ filled }) {
  return (
    <svg className="bn-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={filled ? 2.5 : 1.8} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="7.5" strokeLinecap="round"/>
      <line x1="16.5" y1="16.5" x2="22" y2="22" strokeLinecap="round"/>
    </svg>
  )
}

function MapIcon({ filled }) {
  return (
    <svg className="bn-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={filled ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill={filled ? 'currentColor' : 'none'} />
      <circle cx="12" cy="10" r="3" stroke={filled ? 'var(--bg)' : 'currentColor'} fill="none" />
    </svg>
  )
}

function ProfileIcon({ filled }) {
  return (
    <svg className="bn-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0zM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}
