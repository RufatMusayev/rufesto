import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBooking } from '../hooks'
import { formatBakuDate, formatBakuTime } from '../timeFormat'
import InviteCard from './InviteCard'
import { CheckIcon } from './Icons'

/** Success state after create_group_booking: the invite to share, with a live "n of N joined". */
export default function CreatedPanel({ created, restaurantName }) {
  const { t, i18n } = useTranslation('bookings')
  const { booking } = useBooking(created.bookingId)
  const joined = booking?.memberCount || 1
  const when = created.startsAt
    ? `${formatBakuDate(created.startsAt, i18n.language)} · ${formatBakuTime(created.startsAt)}`
    : ''

  return (
    <div className="bk-created">
      <div className="card state-panel bk-created-card">
        <div className="state-icon" aria-hidden="true"><CheckIcon size={28} /></div>
        <h2 className="state-title">{t('created.title')}</h2>
        <p className="state-body">{restaurantName}</p>
        {when ? <p className="state-meta">{when}</p> : null}
        <p className="state-note bk-created-note">{t('created.pendingNote')}</p>
      </div>
      <InviteCard
        code={created.code}
        joined={joined}
        total={created.partySize}
        restaurantName={restaurantName}
        startsAt={created.startsAt}
      />
      <Link to={`/bookings/${created.bookingId}`} className="btn btn-primary bk-block">
        {t('created.view')}
      </Link>
    </div>
  )
}
