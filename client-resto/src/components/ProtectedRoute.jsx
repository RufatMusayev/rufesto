import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute() {
  const { session, staffRow, loading, error } = useAuth()

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      <span className="spinner" style={{ width: 24, height: 24 }} />
    </div>
  )

  if (!session) return <Navigate to="/login" replace />

  if (!staffRow) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)', color: 'var(--t1)', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem' }}>🔒</div>
      <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Access Denied</h2>
      <p style={{ color: 'var(--t3)', maxWidth: 400, fontSize: '0.88rem' }}>
        {error || 'No active staff record found. Contact your restaurant administrator.'}
      </p>
    </div>
  )

  return <Outlet />
}
