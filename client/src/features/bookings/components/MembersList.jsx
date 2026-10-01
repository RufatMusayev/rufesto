import { useTranslation } from 'react-i18next'
import { Avatar, Pill } from '../../../components/ui'
import { cleanDisplayName } from '../../../lib/helpers'
import { MemberStatusPill } from './BookingStatusPill'

const MAX_OPEN_SEATS = 3

function MemberRow({ member, isMe }) {
  const { t } = useTranslation(['bookings', 'common'])
  const name = cleanDisplayName(member.name)
  return (
    <li className="bk-member">
      <Avatar name={member.name} src={member.photo} size={36} />
      <div className="bk-member-main">
        <div className="bk-member-name">
          <span className="bk-member-text">{name}</span>
          {isMe ? <span className="bk-member-you">({t('common:you')})</span> : null}
        </div>
        <div className="bk-member-pills">
          {member.isHost ? <Pill tone="gold">{t('bookings:member.host')}</Pill> : null}
          <MemberStatusPill status={member.status} />
        </div>
        {member.phone ? (
          <a className="bk-member-phone font-mono" href={`tel:${member.phone}`}>{member.phone}</a>
        ) : null}
      </div>
    </li>
  )
}

/** Who is in the party, plus dashed "Open seat" rows for what is still free. Phones show for the host only (server-filled). */
export default function MembersList({ members, partySize, joinedCount, spotsLeft, myUserId }) {
  const { t } = useTranslation('bookings')
  const open = Math.max(0, spotsLeft)
  const shown = Math.min(open, MAX_OPEN_SEATS)
  return (
    <section className="card bk-members" aria-label={t('detail.members')}>
      <div className="bk-members-head">
        <h2 className="bk-section-title">{t('detail.members')}</h2>
        <span className="bk-members-count font-mono">{t('invite.joinedOf', { joined: joinedCount, total: partySize })}</span>
      </div>
      <ul className="bk-member-list">
        {members.map(m => <MemberRow key={m.userId} member={m} isMe={m.userId === myUserId} />)}
        {Array.from({ length: shown }, (_, i) => (
          <li key={`open-${i}`} className="bk-member bk-member-open">
            <span className="bk-open-dot" aria-hidden="true" />
            <span className="bk-member-text">{t('detail.openSeat')}</span>
          </li>
        ))}
      </ul>
      {open > shown ? <p className="bk-more-seats">{t('detail.moreSeats', { n: open - shown })}</p> : null}
    </section>
  )
}
