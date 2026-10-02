import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState, Pill } from '../../../components/ui'
import LoadError from '../../../components/LoadError'
import { useAuth } from '../../../contexts/AuthContext'
import { useBooking } from '../hooks'
import { formatBakuDate, formatBakuTime } from '../timeFormat'
import TopBar from '../components/TopBar'
import SignInCard from '../components/SignInCard'
import RestaurantHeader from '../components/RestaurantHeader'
import BookingStatusPill from '../components/BookingStatusPill'
import MembersList from '../components/MembersList'
import InviteCard from '../components/InviteCard'
import EnableInvites from '../components/EnableInvites'
import BookingActions from '../components/BookingActions'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHAREABLE = ['pending', 'confirmed', 'seated']

function DetailSkeleton() {
  return (
    <div aria-busy="true">
      <div className="skeleton bk-sk-hero" />
      <div className="skeleton bk-sk-row" />
      <div className="skeleton bk-sk-row" />
      <div className="skeleton bk-sk-row" />
      <div className="skeleton bk-sk-card" />
    </div>
  )
}

export default function BookingDetailPage() {
  const { id } = useParams()
  const { t, i18n } = useTranslation(['bookings', 'common'])
  const { session, loading: authLoading } = useAuth()
  const validId = UUID.test(id || '')
  const { booking, loading, error, reload, refetch } = useBooking(id, !!session && validId)

  const page = children => (
    <div className="bk-page">
      <TopBar title={t('bookings:detail.title')} backTo="/profile" />
      <div className="bk-body">{children}</div>
    </div>
  )

  if (!validId) return page(<NotFound />)
  if (authLoading) return page(<DetailSkeleton />)
  if (!session) {
    return page(<SignInCard title={t('bookings:detail.signInTitle')} body={t('bookings:detail.signInBody')} />)
  }
  if (error) {
    if (error.code === 'booking_not_found') return page(<NotFound />)
    return page(<LoadError onRetry={reload} />)
  }
  if (loading || !booking) return page(<DetailSkeleton />)

  const b = booking
  const joinedCount = b.members.filter(m => ['joined', 'arrived'].includes(m.status)).length
  const myUserId = session.user.id
  const shareable = SHAREABLE.includes(b.status)

  return page(
    <>
      <section className="card bk-hero">
        <RestaurantHeader restaurant={b.restaurant} />
        <div className="bk-hero-when font-mono">
          {formatBakuDate(b.startsAt, i18n.language)} · {formatBakuTime(b.startsAt)}
        </div>
        <div className="bk-hero-meta">
          <BookingStatusPill status={b.status} />
          {b.isGroup ? <Pill tone={b.isHost ? 'gold' : 'gray'}>{b.isHost ? t('bookings:member.host') : t('bookings:member.guest')}</Pill> : null}
          <span className="bk-hero-party">{t('bookings:partyOf', { n: b.partySize })}</span>
          {b.tableNumber != null ? <span className="bk-hero-table font-mono">{t('common:tableLabel', { number: b.tableNumber })}</span> : null}
        </div>
        {b.note ? <p className="bk-hero-note">“{b.note}”</p> : null}
      </section>

      {b.isGroup ? (
        <MembersList
          members={b.members} partySize={b.partySize} joinedCount={joinedCount}
          spotsLeft={b.spotsLeft} myUserId={myUserId}
        />
      ) : null}

      {b.invite && b.invitesEnabled && shareable ? (
        <InviteCard
          code={b.invite.code} joined={joinedCount} total={b.partySize}
          restaurantName={b.restaurant?.name || ''} startsAt={b.startsAt}
        />
      ) : null}
      {!b.invitesEnabled && b.isHost && b.partySize > 1 && shareable ? (
        <EnableInvites bookingId={b.id} onEnabled={refetch} />
      ) : null}

      <BookingActions key={b.id} booking={b} onChanged={refetch} />
    </>,
  )
}

function NotFound() {
  const { t } = useTranslation('bookings')
  return (
    <EmptyState
      icon="🔍" title={t('detail.notFoundTitle')} body={t('detail.notFoundBody')}
      action={<Link to="/profile" className="btn btn-ghost">{t('detail.backToBookings')}</Link>}
    />
  )
}
