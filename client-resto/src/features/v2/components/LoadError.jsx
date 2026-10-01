import { useTranslation } from 'react-i18next'

// Error state with a retry control. `message` is already translated.
export default function LoadError({ message, onRetry, busy = false }) {
  const { t } = useTranslation('v2')
  return (
    <div className="v2-load-error" role="alert">
      <div className="v2-load-error-icon" aria-hidden="true">⚠️</div>
      <p className="v2-load-error-text">{message || t('loadFailed')}</p>
      {onRetry && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry} disabled={busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {t('retry')}
        </button>
      )}
    </div>
  )
}
