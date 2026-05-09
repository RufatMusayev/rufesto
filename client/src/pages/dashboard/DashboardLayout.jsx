import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function DashboardLayout() {
  const { isStaff, staffRow, loading } = useAuth()

  if (loading) return <div style={{ padding: '2rem', color: 'var(--t2)' }}>Loading…</div>
  if (!isStaff) return <Navigate to="/" replace />

  const tabs = [
    { to: '/dashboard',          label: 'Overview', end: true },
    { to: '/dashboard/kds',      label: 'Kitchen' },
    { to: '/dashboard/menu',     label: 'Menu' },
    { to: '/dashboard/bookings', label: 'Bookings' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 1rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 52,
      }}>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} end={t.end} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center',
              padding: '0.4rem 0.85rem', borderRadius: 100, fontSize: '0.8rem', fontWeight: 600,
              textDecoration: 'none',
              background: isActive ? 'var(--accent)' : 'transparent',
              color: isActive ? '#0c0a09' : 'var(--t3)',
              transition: 'all 0.15s',
              border: isActive ? 'none' : '1px solid transparent',
            })}>
              {t.label}
            </NavLink>
          ))}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--t3)' }}>
          {staffRow?.restaurants?.name} · {staffRow?.role}
        </div>
      </div>

      <Outlet />
    </div>
  )
}
