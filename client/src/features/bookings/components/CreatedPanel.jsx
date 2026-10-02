import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBooking } from '../hooks'
import { formatBakuDate, formatBakuTime } from '../timeFormat'
import InviteCard from './InviteCard'
import { CheckIcon } from './Icons'

/**
 * Success state after create_group_booking. With `withInvite` it shows the invite to share (live "n of N joined");
 * without it, the plain confirmation: "Request sent" while the booking is pending, "Booking confirmed" once the
 * restaurant confirms (live, same channel as the detail screen).
 */
export default function CreatedPanel({ created, restaurantName, withInvite }) {
  const { t, i18n } = useTranslation('bookings')
  const { booking } = useBooking(created.bookingId)
  const joined = booking?.memberCount || 1
  const confirmed = booking?.status === 'confirmed'
  const when = created.startsAt
    ? `${formatBakuDate(created.startsAt, i18n.language)} · ${formatBakuTime(created.startsAt)}`
    : ''

  let title = t('created.title')
  let note = t('created.pendingNote')
  if (!withInvite) {
    title = confirmed ? t('created.confirmedTitle') : t('created.requestTitle')
    note = confirmed ? t('created.confirmedNote') : t('created.requestNote')
  }

  return (
    <div className="bk-created">
      <div className="card state-panel bk-created-card">
        <div className="state-icon" aria-hidden="true"><CheckIcon size={28} /></div>
        <h2 className="state-title" aria-live="polite">{title}</h2>
        <p className="state-body">{restaurantName}</p>
        {when ? <p className="state-meta">{when} · {t('partyOf', { n: created.partySize })}</p> : null}
        <p className="state-note bk-created-note">{note}</p>
      </div>
      {withInvite ? (
        <InviteCard
          code={created.code}
          joined={joined}
          total={created.partySize}
          restaurantName={restaurantName}
          startsAt={created.startsAt}
        />
      ) : null}
      <Link to={`/bookings/${created.bookingId}`} className="btn btn-primary bk-block">
        {t('created.view')}
      </Link>
    </div>
  )
}
