import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui'

/**
 * /restaurant/<slug> for a slug that is unknown or no longer active (restaurant_menu answers restaurant_not_found,
 * the header read finds nothing). A mistyped or stale shared link says so instead of dropping the guest on Home.
 */
export default function RestaurantNotFound() {
  const { t } = useTranslation(['restaurant', 'common'])
  return (
    <div className="rst-missing">
      <div className="card rst-missing-card">
        <EmptyState
          icon="🍽️"
          title={t('restaurant:notFound.title')}
          body={t('restaurant:notFound.body')}
          action={<Link to="/" className="btn btn-primary">{t('common:browseRestaurants')}</Link>}
        />
      </div>
    </div>
  )
}
