import { useTranslation } from 'react-i18next'

// Dismissible error line used above page content (same look as BookingsPage).
export default function ErrorBanner({ message, onDismiss }) {
  const { t } = useTranslation('v2')
  if (!message) return null
  return (
    <div className="v2-banner v2-banner--error" role="alert">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" className="v2-banner-close" onClick={onDismiss} aria-label={t('dismiss')}>✕</button>
      )}
    </div>
  )
}
