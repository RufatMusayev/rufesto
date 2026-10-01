import { useTranslation } from 'react-i18next'
import { checkInWindow, formatBakuDate, formatBakuTime } from '../timeFormat'

/**
 * Host check-in. Enabled from 30 minutes before the start until the end time (the server stays the authority);
 * outside that window it is disabled and says why. `now` ticks in the parent.
 */
export default function WeHereButton({ startsAt, endsAt, now, onClick }) {
  const { t, i18n } = useTranslation('bookings')
  const w = checkInWindow(startsAt, endsAt, now)
  let reason = null
  if (w.state === 'early') {
    reason = t('detail.weHereEarly', { when: `${formatBakuDate(w.opensAt, i18n.language)} ${formatBakuTime(w.opensAt)}` })
  } else if (w.state === 'late') {
    reason = t('detail.weHereLate')
  }
  return (
    <div className="bk-wehere">
      <button
        type="button" className="btn btn-primary bk-big" disabled={w.state !== 'open'}
        onClick={onClick} aria-describedby={reason ? 'bk-wehere-reason' : undefined}
      >
        {t('detail.weHere')}
      </button>
      {reason ? <p id="bk-wehere-reason" className="bk-reason">{reason}</p> : null}
    </div>
  )
}
