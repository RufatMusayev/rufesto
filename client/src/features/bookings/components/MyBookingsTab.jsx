import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState, Pill } from '../../../components/ui'
import LoadError from '../../../components/LoadError'
import { useMyBookings } from '../hooks'
import { formatBakuDateLong, formatBakuTime } from '../timeFormat'
import BookingStatusPill from './BookingStatusPill'

const LIVE = ['pending', 'confirmed', 'seated']
const isUpcoming = b => LIVE.includes(b.status) && new Date(b.endsAt).getTime() >= Date.now()

function BookingRow({ booking: b, lang }) {
  const { t } = useTranslation(['bookings', 'common'])
  const invited = b.myRole === 'guest' && b.myStatus === 'invited'
  return (
    <Link to={`/bookings/${b.id}`} className="card bk-row stagger-item">
      <div className="bk-row-top">
        <div className="bk-row-name">{b.restaurant?.name}</div>
        <div className="bk-row-pills">
          {invited ? <Pill tone="amber">{t('bookings:member.invited')}</Pill>
            : b.isGroup ? <Pill tone={b.myRole === 'host' ? 'gold' : 'gray'}>{b.myRole === 'host' ? t('bookings:member.host') : t('bookings:member.guest')}</Pill> : null}
          <BookingStatusPill status={b.status} />
        </div>
      </div>
      <div className="bk-row-meta font-mono">
        <span>{formatBakuDateLong(b.startsAt, lang)}</span>
        <span>{formatBakuTime(b.startsAt)}</span>
        <span>{t('bookings:partyOf', { n: b.partySize })}</span>
      </div>
      {b.tableNumber != null ? <div className="bk-row-sub">{t('common:tableLabel', { number: b.tableNumber })}</div> : null}
      {b.note ? <div className="bk-row-note">“{b.note}”</div> : null}
    </Link>
  )
}

/** Profile -> Bookings: bookings where the guest is host or member, split Upcoming / Past, live. */
export default function MyBookingsTab({ userId }) {
  const { t, i18n } = useTranslation(['bookings', 'common'])
  const { bookings, loading, error, reload } = useMyBookings(userId)
  const [tab, setTab] = useState('upcoming')

  const { upcoming, past } = useMemo(() => {
    const up = bookings.filter(isUpcoming).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
    const pa = bookings.filter(b => !isUpcoming(b)).sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt))
    return { upcoming: up, past: pa }
  }, [bookings])

  if (loading) {
    return (
      <div className="bk-list" aria-busy="true">
        {[1, 2, 3].map(i => <div key={i} className="skeleton bk-sk-row-lg" />)}
      </div>
    )
  }
  if (error) return <LoadError onRetry={reload} />

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon="📅" title={t('bookings:mine.emptyTitle')} body={t('bookings:mine.emptyBody')}
        action={<Link to="/explore" className="btn btn-primary">{t('bookings:bookWithFriends')}</Link>}
      />
    )
  }

  const shown = tab === 'upcoming' ? upcoming : past
  return (
    <div>
      <div className="bk-chips" role="group" aria-label={t('bookings:mine.filter')}>
        {['upcoming', 'past'].map(id => (
          <button
            key={id} type="button" className={`chip${tab === id ? ' active' : ''}`}
            aria-pressed={tab === id} onClick={() => setTab(id)}
          >
            {t(`bookings:mine.${id}`)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState icon="📅" title={t(`bookings:mine.${tab}EmptyTitle`)} body={t(`bookings:mine.${tab}EmptyBody`)} />
      ) : (
        <div className="bk-list">
          {shown.map(b => <BookingRow key={b.id} booking={b} lang={i18n.language} />)}
        </div>
      )}
    </div>
  )
}
