import { useTranslation } from 'react-i18next'

/** Cross-restaurant / pending-guest cart error (CartContext.cartError), floated above the page until dismissed. */
export default function CartErrorBanner({ message, onClose }) {
  const { t } = useTranslation('common')
  if (!message) return null
  return (
    <div className="rst-cart-error" role="alert">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span className="rst-cart-error-text">{message}</span>
      <button type="button" className="tap" onClick={onClose} aria-label={t('close')}>{'×'}</button>
    </div>
  )
}
