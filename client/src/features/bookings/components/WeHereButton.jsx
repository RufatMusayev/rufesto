import { useTranslation } from 'react-i18next'
import { checkInWindow, formatBakuDate, formatBakuTime } from '../timeFormat'

/**
 * Arrival button: it opens the table QR scanner (arriving means scanning the table's QR, nobody is seated remotely).
 * Enabled from 30 minutes before the start until the end time (the server stays the authority); outside that window
 * it is disabled and says why. Inside the window `hint` explains what the button does. `now` ticks in the parent.
 * Host: label "We're here"; a joined member (or a rescan): `label` / `hint` overrides.
 */
export default function WeHereButton({ startsAt, endsAt, now, onClick, label, hint }) {
  const { t, i18n } = useTranslation('bookings')
  const w = checkInWindow(startsAt, endsAt, now)
  let reason = null
  if (w.state === 'early') {
    reason = t('detail.weHereEarly', { when: `${formatBakuDate(w.opensAt, i18n.language)} ${formatBakuTime(w.opensAt)}` })
  } else if (w.state === 'late') {
    reason = t('detail.weHereLate')
  } else {
    reason = hint || t('detail.weHereHint')
  }
  return (
    <div className="bk-wehere">
      <button
        type="button" className="btn btn-primary bk-big" disabled={w.state !== 'open'}
        onClick={onClick} aria-describedby="bk-wehere-reason"
      >
        {label || t('detail.weHere')}
      </button>
      <p id="bk-wehere-reason" className="bk-reason">{reason}</p>
    </div>
  )
}
