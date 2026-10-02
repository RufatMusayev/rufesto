import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import useDialog from '../lib/useDialog'

export default function DeleteConfirmModal({ dishName, loading, error, onConfirm, onCancel }) {
  const { t } = useTranslation('dashboard')
  const uid = useId()
  const dialogRef = useDialog(() => { if (!loading) onCancel() })

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !loading && onCancel()}>
      <div className="modal" ref={dialogRef} role="dialog" aria-modal="true"
        aria-labelledby={`${uid}-title`} aria-describedby={`${uid}-body`} style={{ padding: '1.75rem' }}>
        <h2 id={`${uid}-title`} style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.75rem' }}>{t('deleteDishTitle')}</h2>
        <p id={`${uid}-body`} style={{ fontSize: '0.88rem', color: 'var(--t2)', lineHeight: 1.5 }}>
          {t('deleteDishConfirm', { name: dishName })}
        </p>
        {error && <p role="alert" style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: '0.5rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={loading}>{t('cancel')}</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? <><span className="spinner" /> {t('delete')}…</> : t('delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
