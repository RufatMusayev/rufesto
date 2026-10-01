import { useTranslation } from 'react-i18next'
import { Pill } from '../../../components/ui'

// Booking status -> Pill tone. Same colours as BOOKING_STATUS_STYLE in shared/constants.js, which has
// no entry for no_show, so the mapping lives here.
const TONE = {
  pending: 'amber', confirmed: 'green', seated: 'blue', completed: 'gray', cancelled: 'red', no_show: 'red',
}

export default function BookingStatusPill({ status }) {
  const { t } = useTranslation('bookings')
  const key = TONE[status] ? status : 'pending'
  return <Pill tone={TONE[key]}>{t(`status.${key}`)}</Pill>
}

/** Member status (invited | joined | arrived | left | declined) -> Pill. */
const MEMBER_TONE = { invited: 'amber', joined: 'green', arrived: 'blue', left: 'gray', declined: 'gray' }

export function MemberStatusPill({ status }) {
  const { t } = useTranslation('bookings')
  const key = MEMBER_TONE[status] ? status : 'joined'
  return <Pill tone={MEMBER_TONE[key]}>{t(`member.${key}`)}</Pill>
}
