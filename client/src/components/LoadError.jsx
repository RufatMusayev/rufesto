import { useTranslation } from 'react-i18next'

// Small "couldn't load" notice with a retry button, shown instead of an empty list when a
// Supabase read fails (so a network or permission error never looks like "nothing here").
export default function LoadError({ onRetry }) {
  const { t } = useTranslation('common')
  return (
    <div className="load-error" role="alert">
      <p>{t('loadError')}</p>
      {onRetry && <button className="btn btn-ghost" onClick={onRetry}>{t('retry')}</button>}
    </div>
  )
}
