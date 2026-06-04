import { useEffect } from 'react'

export default function DeleteConfirmModal({ dishName, loading, onConfirm, onCancel }) {
  useEffect(() => {
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [])

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ padding: '1.75rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.75rem' }}>Delete Dish</h2>
        <p style={{ fontSize: '0.88rem', color: 'var(--t2)', lineHeight: 1.5 }}>
          Are you sure you want to delete <strong style={{ color: 'var(--t1)' }}>{dishName}</strong>?
          This action cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? <><span className="spinner" /> Deleting…</> : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
