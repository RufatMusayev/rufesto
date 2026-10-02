import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { PeopleIcon } from './Icons'

/**
 * Step 2 "Who's coming?": the invite switch. On = the host gets a share link after booking (friends join the
 * booking), off = a plain booking for the party. `friends` = seats left for others (party size - 1).
 */
export default function InviteToggle({ checked, onChange, friends, disabled }) {
  const { t } = useTranslation('bookings')
  const id = useId()
  return (
    <div className={`card bk-toggle${checked ? ' on' : ''}`}>
      <div className="bk-toggle-icon" aria-hidden="true"><PeopleIcon size={22} /></div>
      <div className="bk-toggle-text">
        <label className="bk-toggle-title" htmlFor={id}>{t('who.inviteTitle')}</label>
        <p className="bk-toggle-body" id={`${id}-d`}>{t('who.inviteBody', { count: friends })}</p>
      </div>
      <button
        id={id} type="button" role="switch" className="bk-switch"
        aria-checked={checked} aria-describedby={`${id}-d`} disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="bk-switch-knob" />
      </button>
    </div>
  )
}
