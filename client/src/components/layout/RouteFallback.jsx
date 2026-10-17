import { useTranslation } from 'react-i18next'

/** Shown while the chunk of a lazy route is on its way: a quiet spinner in the page area (the nav stays). */
export default function RouteFallback() {
  const { t } = useTranslation('common')
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{t('loading')}</span>
    </div>
  )
}
