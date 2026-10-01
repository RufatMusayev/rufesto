import { useTranslation } from 'react-i18next'
import { Sheet } from '../../../components/ui'

/** Destructive-action confirmation: a Sheet with btn-danger + btn-ghost cancel. */
export default function ConfirmSheet({ open, title, body, confirmLabel, pending = false, error = null, onConfirm, onClose }) {
  const { t } = useTranslation(['social', 'common'])
  return (
    <Sheet
      open={open}
      onClose={pending ? undefined : onClose}
      title={title}
      footer={(
        <div className="soc-confirm-actions">
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={pending}>
            {pending ? <span className="spinner" aria-hidden="true" /> : null}
            {confirmLabel}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            {t('common:cancel')}
          </button>
        </div>
      )}
    >
      {body ? <p className="soc-confirm-body">{body}</p> : null}
      {error ? <p className="soc-error" role="alert">{t(error)}</p> : null}
    </Sheet>
  )
}
