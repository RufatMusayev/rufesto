import { useTranslation } from 'react-i18next'

// Red banner above a page's content for a failed action ("Something went wrong..."), with a close button.
// Styles: .action-banner in index.css (the close button is a full touch target on phones).
export default function ActionBanner({ message, onClose }) {
  const { t } = useTranslation('common')
  return (
    <div className="action-banner" role="alert">
      <span>{message}</span>
      <button type="button" className="action-banner-close" onClick={onClose} title={t('close')}>✕</button>
    </div>
  )
}
