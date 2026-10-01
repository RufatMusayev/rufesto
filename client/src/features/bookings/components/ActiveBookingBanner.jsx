import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import { useCart } from '../../../contexts/CartContext'
import { useMyBookings } from '../hooks'
import { formatBakuTime } from '../timeFormat'

const WINDOW_MS = 2 * 60 * 60 * 1000
const LIVE = ['pending', 'confirmed']

/** Small card for the Table empty state: a booking that starts within 2 hours (or is under way) links to its screen. */
export default function ActiveBookingBanner() {
  const { t } = useTranslation('bookings')
  const { session } = useAuth()
  const cart = useCart()
  const { bookings, loading, error } = useMyBookings(session?.user?.id || null)
  if (!session || loading || error || cart?.tableId) return null

  const now = Date.now()
  const next = bookings
    .filter(b => LIVE.includes(b.status) && now >= new Date(b.startsAt).getTime() - WINDOW_MS && now <= new Date(b.endsAt).getTime())
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0]
  if (!next) return null

  return (
    <Link to={`/bookings/${next.id}`} className="card bk-banner">
      <span className="bk-banner-icon" aria-hidden="true">📅</span>
      <span className="bk-banner-text">
        <span className="bk-banner-title">{t('banner.title', { restaurant: next.restaurant?.name })}</span>
        <span className="bk-banner-sub font-mono">{formatBakuTime(next.startsAt)}</span>
      </span>
      <span className="bk-banner-cta">{t('banner.open')}</span>
    </Link>
  )
}
