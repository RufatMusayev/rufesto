import { useTranslation } from 'react-i18next'
import { localeTag } from '../../../lib/time'
import { bakuDayMonth, bakuTime } from '../dates'
import Money from './Money'
import StatusPill, { TIP_TONE } from './StatusPill'

// my_tips reports the payment provider: demo | reception | cash.
const METHOD_KEY = { demo: 'methodDemo', card: 'methodCard', reception: 'methodReception', cash: 'methodCash' }

// The caller's own tips in the server's order (newest first). `withDate` adds the
// day to the time when the range spans more than one day. A pending tip has no
// payment time yet.
export default function MyTipsList({ tips, withDate }) {
  const { t, i18n } = useTranslation(['v2', 'common'])
  const tag = localeTag(i18n.language)

  return (
    <ul className="v2-tip-list">
      {tips.map(tip => {
        const when = tip.paidAt
          ? (withDate ? `${bakuDayMonth(tip.paidAt, tag)} ${bakuTime(tip.paidAt, tag)}` : bakuTime(tip.paidAt, tag))
          : ''
        const meta = [
          when,
          tip.method && METHOD_KEY[tip.method] && t(METHOD_KEY[tip.method]),
          tip.payerFirstName && t('tipFrom', { name: tip.payerFirstName }),
        ].filter(Boolean)
        return (
          <li key={tip.id} className={`v2-tip${tip.status === 'void' ? ' is-void' : ''}`}>
            <div className="v2-tip-main">
              <span className="v2-tip-table">
                {tip.tableNumber != null ? t('common:tableLabel', { number: tip.tableNumber }) : t('tipNoTable')}
              </span>
              {meta.length > 0 && <span className="v2-tip-meta">{meta.join(' · ')}</span>}
            </div>
            <div className="v2-tip-side">
              <Money value={tip.amount} strong tone={tip.status === 'void' ? 'muted' : undefined} />
              <StatusPill tone={TIP_TONE[tip.status] || 'gray'}>{t(`tipStatus_${tip.status}`, { defaultValue: tip.status })}</StatusPill>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
