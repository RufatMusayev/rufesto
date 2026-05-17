import { NavLink, Outlet, Navigate, Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const NAV = [
  { to: '/dashboard',          label: 'Overview', end: true, icon: OverviewIcon },
  { to: '/dashboard/orders',   label: 'Orders',              icon: OrdersIcon },
  { to: '/dashboard/kds',      label: 'Kitchen',             icon: KitchenIcon },
  { to: '/dashboard/tables',   label: 'Tables',              icon: TablesIcon },
  { to: '/dashboard/menu',     label: 'Menu',                icon: MenuIcon },
  { to: '/dashboard/bookings', label: 'Bookings',            icon: BookingsIcon },
]

export default function DashboardLayout() {
  const { isStaff, staffRow, loading } = useAuth()

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      <span className="spinner" style={{ width: 24, height: 24 }} />
    </div>
  )
  if (!isStaff) return <Navigate to="/" replace />

  const initial = staffRow?.restaurants?.name?.[0] || 'R'

  return (
    <div className="dash-layout">
      {/* Sidebar */}
      <aside className="dash-sidebar">
        <div className="dash-sidebar-head">
          <div className="dash-resto-badge">{initial}</div>
          <div className="dash-resto-info">
            <div className="dash-resto-name">{staffRow?.restaurants?.name || 'Restaurant'}</div>
            <div className="dash-resto-role">{staffRow?.role || 'Staff'}</div>
          </div>
        </div>

        <nav className="dash-nav">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `dash-nav-item${isActive ? ' active' : ''}`}>
              <n.icon />
              <span className="dash-nav-label">{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="dash-sidebar-foot">
          <Link to="/" className="dash-nav-item">
            <ExitIcon />
            <span className="dash-nav-label">Back to App</span>
          </Link>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="dash-mobile-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="dash-resto-badge" style={{ width: 28, height: 28, fontSize: '0.72rem' }}>{initial}</div>
          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{staffRow?.restaurants?.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: 'var(--green)' }}>
          <span className="dash-live-dot" /> Live
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="dash-mobile-nav">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => `dash-mobile-nav-item${isActive ? ' active' : ''}`}>
            <n.icon />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="dash-content">
        <Outlet />
      </main>
    </div>
  )
}

/* ── Icons ── */
function OverviewIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
}
function OrdersIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 14h6M9 18h6" /></svg>
}
function KitchenIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12c-3 0-5 2-5 5h10c0-3-2-5-5-5z" /><path d="M12 12V8M9 3c0 2 1 3 3 5M15 3c0 2-1 3-3 5" /><line x1="4" y1="20" x2="20" y2="20" /></svg>
}
function TablesIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="3" rx="1" /><path d="M5 11v7M19 11v7M8 8V5M16 8V5" /></svg>
}
function MenuIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="14" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="14" y2="18" /><circle cx="19" cy="6" r="2" /><circle cx="19" cy="12" r="2" /><circle cx="19" cy="18" r="2" /></svg>
}
function BookingsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /></svg>
}
function ExitIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
}
