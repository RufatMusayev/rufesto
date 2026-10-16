import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import useDialog from '../../../lib/useDialog'

// Confirm dialog for deleting a post. Focus trap, Esc, scroll lock and focus restore come from lib/useDialog;
// `error` (already translated) stays inside the dialog so a failed delete can be retried or cancelled.
export default function DeletePostModal({ busy = false, error = '', onConfirm, onCancel }) {
  const { t } = useTranslation('v2')
  const uid = useId()
  const dialogRef = useDialog(() => { if (!busy) onCancel() })

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <div
        className="modal v2-confirm"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        aria-describedby={`${uid}-body`}
      >
        <h2 id={`${uid}-title`} className="v2-confirm-title">{t('postsDeleteTitle')}</h2>
        <p id={`${uid}-body`} className="v2-confirm-body">{t('postsDeleteBody')}</p>
        {error && <p className="v2-field-error v2-confirm-error" role="alert">{error}</p>}
        <div className="v2-confirm-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>{t('cancel')}</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {t('postsDelete')}
          </button>
        </div>
      </div>
    </div>
  )
}
