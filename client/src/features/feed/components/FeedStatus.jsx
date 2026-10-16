import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/ui'
import LoadError from '../../../components/LoadError'

/**
 * A failed load. A missing RPC (PostgREST 404 / PGRST202, error code 'unavailable': the SQL is not applied on
 * this database yet) shows the calm empty state with a retry; any other failure shows the usual notice.
 */
export default function FeedStatus({ error, onRetry }) {
  const { t } = useTranslation('social')
  if (error?.code !== 'unavailable') return <LoadError onRetry={onRetry} />
  return (
    <EmptyState
      icon="🍽️"
      title={t('feed.unavailableTitle')}
      body={t('feed.unavailableBody')}
      action={<button type="button" className="btn btn-ghost" onClick={onRetry}>{t('feed.retry')}</button>}
    />
  )
}
