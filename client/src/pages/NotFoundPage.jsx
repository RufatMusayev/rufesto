import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/ui'
import './NotFoundPage.css'

/** Catch-all route (inside AppLayout, so the nav stays): a mistyped or cut-off link ends here instead of a blank page. */
export default function NotFoundPage() {
  const { t } = useTranslation('common')
  return (
    <div className="nf-page">
      <div className="card nf-card">
        <EmptyState
          icon="🧭" title={t('notFoundTitle')} body={t('notFoundBody')}
          action={<Link to="/" className="btn btn-primary">{t('browseRestaurants')}</Link>}
        />
      </div>
    </div>
  )
}
