import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../../components/ui'
import { CheckIcon } from './Icons'

/**
 * /bill when the guest has no table any more but settled a bill earlier in this session (lastSettled.js): "Paid" with
 * a link to that bill's receipt, instead of "Nothing to pay yet".
 */
export default function SettledMemo({ settled }) {
  const { t } = useTranslation('bills')
  return (
    <section className="card state-panel bl-settled" aria-live="polite">
      <div className="state-icon"><CheckIcon /></div>
      <h2 className="state-title">{t('paidCheckTitle')}</h2>
      {settled.amount != null ? (
        <div className="bl-settled-amount">
          <span>{t('youPaid')}</span>
          <MoneyText value={settled.amount} size="1.5rem" strong />
        </div>
      ) : null}
      <p className="state-note">
        {settled.restaurant ? t('paidAtBody', { restaurant: settled.restaurant }) : t('paidAtBodyPlain')}
      </p>
      <div className="state-actions">
        <Link to={`/receipt/${settled.billId}`} className="btn btn-primary">{t('viewReceipt')}</Link>
        <Link to="/" className="btn btn-ghost">{t('backHome')}</Link>
      </div>
    </section>
  )
}
