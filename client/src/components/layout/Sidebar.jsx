import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCart } from '../../contexts/CartContext'
import { warmSearch } from '../../features/search/warm'

// The rail (>= 1024 px): Home, Search, Map, Notifications, Table, Profile (docs/UX-PLAN-2026-10-18.md D10). Language and
// theme are in Profile > Settings; Friends is on Profile. unreadCount is owned by AppLayout (single subscription).
export default function Sidebar({ unreadCount = 0 }) {
  const { tableId } = useCart()
  const { t } = useTranslation('nav')

  return (
    <aside className="rail">
      <div className="rail-logo">R</div>
      <nav className="rail-items" aria-label={t('home')}>
        <SideItem to="/" label={t('home')} Icon={HomeIcon} />
        <SideItem to="/explore" label={t('search')} Icon={SearchIcon} onWarm={warmSearch} />
        <SideItem to="/map" label={t('map')} Icon={MapIcon} />
        <SideItem to="/notifications" label={t('notifications')} Icon={BellIcon} badge={unreadCount} />
        <SideItem to="/table" label={tableId ? t('yourTable') : t('enterTableCode')} Icon={QrIcon} dot={!!tableId} />
        <SideItem to="/profile" label={t('profile')} Icon={ProfileIcon} />
      </nav>
    </aside>
  )
}

function SideItem({ to, label, Icon, onWarm, badge = 0, dot = false }) {
  return (
    <NavLink
      to={to} end={to === '/'} title={label} aria-label={label}
      onPointerDown={onWarm} onTouchStart={onWarm} onMouseEnter={onWarm} className={({ isActive }) => `rail-item pressable${isActive ? ' active' : ''}`}
    >
      {({ isActive }) => (
        <>
          <Icon filled={isActive} />
          {badge > 0 && <span className="rail-badge">{badge > 9 ? '9+' : badge}</span>}
          {dot && badge === 0 && <span className="rail-dot" />}
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

function QrIcon({ filled }) {
  const w = filled ? 2.4 : 1.8
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" />
      <path d="M14 14h3M20 14v0M14 17v4M17 21h4M20.5 17.5v0" />
    </svg>
  )
}
