import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/** The one "Reserve a table" button of the restaurant page: opens the booking wizard (/book/:slug). */
export default function ReserveButton({ restaurant }) {
  const { t } = useTranslation('bookings')
  if (!restaurant?.slug) return null
  return (
    <Link to={`/book/${restaurant.slug}`} className="btn btn-primary bk-reserve-btn">
      {t('reserve')}
    </Link>
  )
}
