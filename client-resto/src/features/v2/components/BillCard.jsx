import { useTranslation } from 'react-i18next'
import { formatPrice } from '@shared/helpers'
import { localeTag } from '../../../lib/time'
import { isTodayBill } from './BillStats'
import Money from './Money'
import ShareRow from './ShareRow'
import StatusPill, { BILL_TONE } from './StatusPill'

// One bill: table, status, total, collected-vs-total bar, a row per person and
// the whole-bill actions. Staff settle reception / cash shares from here;
// managers and admins (`canVoid`) can also cancel an unpaid bill.
export default function BillCard({ bill, busyShares, canVoid = false, onMarkShare, onMarkBill, onVoidBill }) {
  const { t, i18n } = useTranslation(['v2', 'common'])
  const canCloseBill = bill.status !== 'paid' && bill.status !== 'void'
  const collected = Math.min(bill.collected, bill.total)
  const older = !isTodayBill(bill)

  return (
    <article className={`v2-bill v2-bill--${bill.status}`}>
      <div className="v2-bill-bar" aria-hidden="true" />
      <div className="v2-bill-body">
        <header className="v2-bill-head">
          <div>
            <div className="v2-bill-table">{t('common:tableLabel', { number: bill.tableNumber })}</div>
            <div className="v2-bill-section">
              {[bill.sectionName, older && t('billFromDate', {
                date: new Date(bill.createdAt).toLocaleDateString(localeTag(i18n.language), { day: 'numeric', month: 'short', timeZone: 'Asia/Baku' }),
              })].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="v2-bill-head-right">
            <StatusPill tone={BILL_TONE[bill.status] || 'gray'}>{t(`billStatus_${bill.status}`, { defaultValue: bill.status })}</StatusPill>
            <Money value={bill.total} strong />
          </div>
        </header>

        <progress
          className="v2-progress"
          max={bill.total > 0 ? bill.total : 1}
          value={collected}
          aria-label={t('billProgress', { collected: formatPrice(collected), total: formatPrice(bill.total) })}
        />

        {bill.shares.length === 0 ? (
          <p className="v2-muted">{t('noShares')}</p>
        ) : (
          <ul className="v2-shares">
            {bill.shares.map(s => (
              <ShareRow key={s.id} share={s} voided={bill.status === 'void'} busy={busyShares.has(s.id)} onMarkPaid={share => onMarkShare(bill.id, share)} />
            ))}
          </ul>
        )}

        {bill.tips.filter(tip => tip.amount > 0).map((tip, i) => (
          <div key={i} className="v2-bill-tip">
            {tip.waiterName
              ? t('tipTo', { amount: formatPrice(tip.amount), name: tip.waiterName })
              : t('tipTeam', { amount: formatPrice(tip.amount) })}
          </div>
        ))}

        {canCloseBill && (
          <footer className="v2-bill-foot">
            {canVoid && (
              <button type="button" className="btn btn-danger btn-sm" onClick={() => onVoidBill(bill)}>
                {t('voidBill')}
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMarkBill(bill)}>
              {t('markWholePaid')}
            </button>
          </footer>
        )}
      </div>
    </article>
  )
}
