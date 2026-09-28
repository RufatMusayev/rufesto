import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { canAccess, homeFor } from '../lib/roles'

// Sits between ProtectedRoute (session + active staff row) and DashboardLayout.
// Redirects a staff member away from a page their role isn't allowed to open,
// and shows a dead-end screen for a role this dashboard doesn't know about at
// all (same shape as ProtectedRoute's "no staff row" screen).
export default function RoleGate() {
  const { staffRow, signOut } = useAuth()
  const { t } = useTranslation('dashboard')
  const location = useLocation()
  const role = staffRow?.role
  const home = homeFor(role)

  if (!home) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)', color: 'var(--t1)', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem' }}>🔒</div>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{t('accessDeniedTitle')}</h2>
        <p style={{ color: 'var(--t3)', maxWidth: 400, fontSize: '0.88rem' }}>
          {t('unknownRoleNotice')}
        </p>
        <button className="btn btn-ghost" onClick={signOut}>{t('navSignOut')}</button>
      </div>
    )
  }

  if (!canAccess(role, location.pathname)) {
    return <Navigate to={home} replace />
  }

  return <Outlet />
}
