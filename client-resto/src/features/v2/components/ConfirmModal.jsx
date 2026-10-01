import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

// Confirmation dialog on the dashboard's .overlay + .modal. Esc and a click on
// the backdrop cancel; the confirm button is disabled while `busy`.
export default function ConfirmModal({ title, body, confirmLabel, danger = false, busy = false, onConfirm, onCancel }) {
  const { t } = useTranslation('v2')
  const cancelRef = useRef(null)

  useEffect(() => {
    document.body.classList.add('modal-open')
    cancelRef.current?.focus()
    const onKey = e => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('modal-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [busy, onCancel])

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <div className="modal v2-confirm" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="v2-confirm-title">{title}</h2>
        {body && <p className="v2-confirm-body">{body}</p>}
        <div className="v2-confirm-actions">
          <button ref={cancelRef} type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {t('cancel')}
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
