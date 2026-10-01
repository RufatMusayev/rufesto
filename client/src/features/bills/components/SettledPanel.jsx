import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../../components/ui'
import { CheckIcon } from './Icons'
import { DemoBadge, DemoNotice } from './DemoBadge'
import LoyaltyEarned from './LoyaltyEarned'
import WaitingList from './WaitingList'
import ReviewPrompt from './ReviewPrompt'

/**
 * After my share is paid (or the whole bill is): "Payment received" with the DEMO badge when it was a demo
 * payment, the credits earned, who the table is still waiting for, and, once the bill is settled, the receipt,
 * Leave table and the review prompt. `payment` is my succeeded payment, null when somebody else covered me.
 */
export default function SettledPanel({ bill, payment, leaving, onLeave }) {
  const { t } = useTranslation('bills')
  const meId = bill.people.find(p => p.isMe)?.userId
  const waiting = bill.shares.filter(s => s.status === 'pending' && s.userId !== meId)
  const settled = bill.status === 'paid'

  return (
    <>
      <section className="card state-panel bl-settled" aria-live="polite">
        <div className="state-icon"><CheckIcon /></div>
        <h2 className="state-title">{payment ? t('settledTitle') : t('billSettled')}</h2>
        {payment ? (
          <div className="bl-settled-amount">
            <MoneyText value={payment.amount} size="1.5rem" strong />
            {payment.isDemo ? <DemoBadge /> : null}
          </div>
        ) : null}
        {payment?.isDemo ? <DemoNotice /> : null}
        <LoyaltyEarned value={bill.loyaltyEarned} />

        {settled ? (
          <>
            {payment ? <p className="bl-settled-line">{t('billSettled')}</p> : null}
            <p className="state-note">{t('billSettledBody')}</p>
            <div className="state-actions">
              <Link to={`/receipt/${bill.id}`} className="btn btn-primary">{t('viewReceipt')}</Link>
              <button type="button" className="btn btn-ghost" disabled={leaving} onClick={onLeave}>
                {t('leaveTable')}
              </button>
            </div>
          </>
        ) : (
          <WaitingList shares={waiting} />
        )}
      </section>
      {settled ? <ReviewPrompt bill={bill} /> : null}
    </>
  )
}
