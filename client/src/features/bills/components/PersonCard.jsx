import { useTranslation } from 'react-i18next'
import { Avatar, MoneyText } from '../../../components/ui'
import { cleanDisplayName, formatPrice } from '../../../lib/helpers'
import { dishName } from '../mappers'
import { sameAmount } from '../money'
import { CheckIcon } from './Icons'

/** One person of the party: what they ordered, what it comes to, and (once a split is chosen) what they pay. */
export default function PersonCard({ person, lang }) {
  const { t } = useTranslation(['bills', 'common'])
  const name = cleanDisplayName(person.name)
  const showShare = person.shareAmount != null && !sameAmount(person.shareAmount, person.amountDue)

  return (
    <div className={`card bl-person stagger-item${person.isMe ? ' bl-person-me' : ''}`}>
      <div className="bl-person-head">
        <Avatar name={person.name} size={36} />
        <div className="bl-person-name">
          <span className="bl-person-name-text">{name}</span>
          {person.isHost ? <span className="bl-crown" role="img" aria-label={t('bills:host')}>👑</span> : null}
          {person.isMe ? <span className="bl-you">({t('common:you')})</span> : null}
        </div>
        <MoneyText value={person.amountDue} strong />
        {person.paid ? (
          <span className="bl-paid-tick" role="img" aria-label={t('bills:paidBadge')}>
            <CheckIcon size={16} width={3} color="var(--sage)" />
          </span>
        ) : null}
      </div>
      {showShare ? (
        <div className="bl-person-pays">{t('bills:paysAmount', { amount: formatPrice(person.shareAmount) })}</div>
      ) : null}
      {person.items.length ? (
        <ul className="bl-items">
          {person.items.map(item => (
            <li key={item.lineId || `${item.dishId}-${item.name}`} className="bl-item">
              <span className="bl-item-name">{t('bills:itemLine', { qty: item.qty, name: dishName(item, lang) })}</span>
              <span className="bl-item-dots" aria-hidden="true" />
              <span className="bl-item-price">{formatPrice(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="bl-items-empty">{t('bills:noItems')}</div>
      )}
    </div>
  )
}
