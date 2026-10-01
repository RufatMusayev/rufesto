import { useTranslation } from 'react-i18next'
import { Sheet } from '../../../components/ui'

/**
 * Confirmation in a Sheet. `danger` (cancel / leave) renders btn-danger + btn-ghost; otherwise the confirm
 * button is btn-primary. While `pending` both buttons are disabled and the sheet cannot be dismissed.
 */
export default function ConfirmSheet({
  open, title, body, confirmLabel, danger = false, pending = false, error = null, onConfirm, onClose,
}) {
  const { t } = useTranslation(['bookings', 'common'])
  return (
    <Sheet
      open={open}
      onClose={pending ? undefined : onClose}
      title={title}
      footer={(
        <div className="bk-confirm-actions">
          <button
            type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm} disabled={pending}
          >
            {pending ? <span className="spinner" aria-hidden="true" /> : null}
            {confirmLabel}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            {t('common:cancel')}
          </button>
        </div>
      )}
    >
      {body ? <p className="bk-confirm-body">{body}</p> : null}
      {error ? <p className="bk-error" role="alert">{t(error)}</p> : null}
    </Sheet>
  )
}
