import { useTranslation } from 'react-i18next'
import { Avatar, Pill } from '../../../components/ui'
import { cleanDisplayName } from '../../../lib/helpers'

/** Who gets the tip: the assigned waiter is preselected, any other waiter, or the whole team. The server
 *  only sends first names. Hidden when the list is empty (the tip then goes to the whole team). */
export default function WaiterPicker({ waiters, value, onChange }) {
  const { t } = useTranslation('bills')
  if (!waiters.length) return null

  return (
    <section className="bl-section" aria-labelledby="bl-waiter-title">
      <h2 id="bl-waiter-title" className="bl-section-title">{t('waiterTitle')}</h2>
      <div className="bl-options" role="radiogroup" aria-labelledby="bl-waiter-title">
        {waiters.map(w => (
          <button
            key={w.staffId} type="button" role="radio" aria-checked={value === w.staffId}
            className={`bl-option${value === w.staffId ? ' bl-option-on' : ''}`}
            onClick={() => onChange(w.staffId)}
          >
            <span className="bl-option-who">
              <Avatar name={w.firstName} size={28} />
              <span className="bl-option-label">{cleanDisplayName(w.firstName)}</span>
              {w.isAssigned ? <Pill tone="gold">{t('yourWaiter')}</Pill> : null}
            </span>
          </button>
        ))}
        <button
          type="button" role="radio" aria-checked={value === 'team'}
          className={`bl-option${value === 'team' ? ' bl-option-on' : ''}`}
          onClick={() => onChange('team')}
        >
          <span className="bl-option-who">
            <span className="bl-team-icon" aria-hidden="true">👥</span>
            <span className="bl-option-label">{t('wholeTeam')}</span>
          </span>
        </button>
      </div>
    </section>
  )
}
