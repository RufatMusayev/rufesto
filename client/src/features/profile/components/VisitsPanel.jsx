import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState, MoneyText } from '../../../components/ui'
import { formatBakuDateLong, formatBakuTime } from '../../bookings/timeFormat'
import { useMyBookings } from '../../bookings/hooks'
import BookingStatusPill from '../../bookings/components/BookingStatusPill'
import Panel, { RowSkeletons } from './Panel'
import { ChevronIcon } from './Icons'

const LIVE = ['pending', 'confirmed', 'seated']
const isUpcoming = b => LIVE.includes(b.status) && new Date(b.endsAt).getTime() >= Date.now()

/** An upcoming booking: restaurant, day and time, party, status. Opens the booking. */
function BookingRow({ booking: b, lang }) {
  const { t } = useTranslation(['profile', 'bookings'])
  return (
    <Link to={`/bookings/${b.id}`} className="card pf-card stagger-item">
      <div className="pf-row">
        <div className="pf-thumb pf-thumb-logo" aria-hidden="true">
          {b.restaurant?.logo ? <img src={b.restaurant.logo} alt="" loading="lazy" /> : <span>📅</span>}
        </div>
        <div className="pf-row-main">
          <div className="pf-row-title">{b.restaurant?.name || t('profile:restaurantFallback')}</div>
          <div className="pf-row-sub font-mono">
            {formatBakuDateLong(b.startsAt, lang)} · {formatBakuTime(b.startsAt)} · {t('bookings:partyOf', { n: b.partySize })}
          </div>
        </div>
        <div className="pf-visit-end"><BookingStatusPill status={b.status} /><ChevronIcon size={14} /></div>
      </div>
    </Link>
  )
}

function VisitRow({ visit: v, lang }) {
  const { t } = useTranslation('profile')
  const name = v.restaurant?.name || t('restaurantFallback')
  const content = (
    <div className="pf-row">
      <div className="pf-thumb pf-thumb-logo" aria-hidden="true">
        {v.restaurant?.logo
          ? <img src={v.restaurant.logo} alt="" loading="lazy" />
          : <span>🍽️</span>}
      </div>
      <div className="pf-row-main">
        <div className="pf-row-title">{name}</div>
        <div className="pf-row-sub font-mono">{formatBakuDateLong(v.visitedAt, lang)}</div>
      </div>
      <div className="pf-visit-end">
        <MoneyText value={v.amount} strong />
        {v.billId ? <ChevronIcon size={14} /> : null}
      </div>
    </div>
  )
  return v.billId
    ? <Link to={`/receipt/${v.billId}`} className="card pf-card stagger-item" aria-label={t('viewReceiptOf', { name })}>{content}</Link>
    : <div className="card pf-card stagger-item">{content}</div>
}

/**
 * Profile -> Visits: the upcoming bookings first (they used to be a tab of their own), then one row per paid bill
 * (restaurant, date, amount); a bill opens its receipt.
 */
export default function VisitsPanel({ resource, userId }) {
  const { t, i18n } = useTranslation('profile')
  const { bookings } = useMyBookings(userId)
  const upcoming = useMemo(
    () => bookings.filter(isUpcoming).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)),
    [bookings],
  )
  return (
    <>
      {upcoming.length > 0 ? (
        <section aria-labelledby="pf-up-title">
          <h2 id="pf-up-title" className="pf-sec">{t('upcomingBookings')}</h2>
          <div className="pf-list">
            {upcoming.map(b => <BookingRow key={b.id} booking={b} lang={i18n.language} />)}
          </div>
        </section>
      ) : null}
      <Panel
        resource={resource}
        skeleton={<RowSkeletons count={upcoming.length ? 2 : 4} />}
        empty={upcoming.length ? null : (
          <EmptyState
            icon="🧾" title={t('noVisitsTitle')} body={t('noVisitsBody')}
            action={<Link to="/explore" className="btn btn-ghost">{t('exploreRestaurants')}</Link>}
          />
        )}
      >
        {visits => (
          <section aria-labelledby={upcoming.length ? 'pf-past-title' : undefined}>
            {upcoming.length ? <h2 id="pf-past-title" className="pf-sec pf-sec-gap">{t('pastVisits')}</h2> : null}
            <div className="pf-list">
              {visits.map(v => <VisitRow key={v.id} visit={v} lang={i18n.language} />)}
            </div>
          </section>
        )}
      </Panel>
    </>
  )
}
