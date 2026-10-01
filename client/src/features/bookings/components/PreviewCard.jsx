import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pill } from '../../../components/ui'
import { cuisineEmoji } from '../../../lib/helpers'
import { formatBakuDate, formatBakuTime } from '../timeFormat'
import { PeopleIcon } from './Icons'

const STATUS_TONE = { pending: 'amber', confirmed: 'green', seated: 'blue', completed: 'gray', cancelled: 'red', no_show: 'red' }
const MAX_FACES = 5

/**
 * What an invited guest sees before signing in: restaurant, who invited them, when, party size and how many
 * have joined. Everything here comes from get_group_booking_preview, which carries no contact details.
 */
export default function PreviewCard({ preview }) {
  const { t, i18n } = useTranslation('bookings')
  const [broken, setBroken] = useState(false)
  const { restaurant } = preview
  const tone = STATUS_TONE[preview.status] || 'gray'
  const faces = Math.min(preview.joinedCount, MAX_FACES)

  return (
    <div className="bk-preview">
      <div className="bk-preview-cover" aria-hidden="true">
        {restaurant?.cover && !broken
          ? <img src={restaurant.cover} alt="" onError={() => setBroken(true)} />
          : <span>{cuisineEmoji(null)}</span>}
      </div>
      <h1 className="bk-preview-name">{restaurant?.name}</h1>
      <p className="bk-preview-host">
        {preview.hostFirstName ? t('invite.invitedBy', { name: preview.hostFirstName }) : t('invite.invited')}
      </p>
      <p className="bk-preview-when font-mono">
        {formatBakuDate(preview.startsAt, i18n.language)} · {formatBakuTime(preview.startsAt)} · {t('partyOf', { n: preview.partySize })}
      </p>
      <div className="bk-preview-joined">
        <span className="bk-faces" aria-hidden="true">
          {Array.from({ length: faces }, (_, i) => <span key={i} className="bk-face"><PeopleIcon size={12} /></span>)}
        </span>
        <span>{t('invite.joinedOf', { joined: preview.joinedCount, total: preview.partySize })}</span>
      </div>
      <div className="bk-preview-status">
        <Pill tone={tone}>{t(`invite.status.${STATUS_TONE[preview.status] ? preview.status : 'pending'}`)}</Pill>
      </div>
    </div>
  )
}
