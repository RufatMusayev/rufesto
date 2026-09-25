import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export default function DeleteConfirmModal({ dishName, loading, error, onConfirm, onCancel }) {
  const { t } = useTranslation('dashboard')

  useEffect(() => {
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [])

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ padding: '1.75rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.75rem' }}>{t('deleteDishTitle')}</h2>
        <p style={{ fontSize: '0.88rem', color: 'var(--t2)', lineHeight: 1.5 }}>
          {t('deleteDishConfirm', { name: dishName })}
        </p>
        {error && <p style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: '0.5rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel} disabled={loading}>{t('cancel')}</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? <><span className="spinner" /> {t('delete')}…</> : t('delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
