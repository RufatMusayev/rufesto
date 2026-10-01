import { useTranslation } from 'react-i18next'
import { Avatar, MoneyText } from '../../../components/ui'
import { cleanDisplayName } from '../../../lib/helpers'

/** "Waiting for 2 people": who still owes their share and how much. Live: the bill hook refetches on every
 *  payment event, so a row disappears as soon as that person pays. */
export default function WaitingList({ shares }) {
  const { t } = useTranslation('bills')
  if (!shares.length) return null
  return (
    <div className="bl-waiting" aria-live="polite">
      <div className="bl-waiting-title">
        <span className="bl-live-dot avail-pulse" aria-hidden="true" />
        {t('waitingFor', { count: shares.length })}
      </div>
      <ul className="bl-waiting-list">
        {shares.map(s => (
          <li key={s.id} className="bl-waiting-row">
            <Avatar name={s.name} size={28} />
            <span className="bl-waiting-name">{cleanDisplayName(s.name)}</span>
            <MoneyText value={s.amount} tone="muted" />
          </li>
        ))}
      </ul>
    </div>
  )
}
