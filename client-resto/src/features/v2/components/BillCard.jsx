import { useTranslation } from 'react-i18next'
import { formatPrice } from '../../../lib/format'
import { localeTag } from '../../../lib/time'
import BillMenu from './BillMenu'
import { isTodayBill } from './BillStats'
import Money from './Money'
import ShareRow from './ShareRow'
import StatusPill, { BILL_TONE } from './StatusPill'

// One bill: table, status, total, collected-vs-total bar, a row per person and
// the whole-bill action. Staff settle reception / cash shares from here. Managers and admins (`canVoid`) can also
// cancel an unpaid bill, from the "..." menu in the header (a destructive action stays away from the settle buttons;
// it asks for a confirmation).
//
// Settling has ONE obvious action: a bill with a single share left to pay is settled by that share's "Mark paid";
// "Mark whole bill paid" only appears when it does something the rows cannot (two or more shares, a share a guest is
// paying by card right now, or a bill without shares).
export default function BillCard({ bill, busyShares, canVoid = false, onMarkShare, onMarkBill, onVoidBill }) {
  const { t, i18n } = useTranslation(['v2', 'common'])
  const canCloseBill = bill.status !== 'paid' && bill.status !== 'void'
  const collected = Math.min(bill.collected, bill.total)
  const older = !isTodayBill(bill)
  const unpaid = bill.shares.filter(s => !s.paid)
  const soleShareRow = unpaid.length === 1 && unpaid[0].canMarkPaid
  const showWhole = canCloseBill && !soleShareRow

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
            {canVoid && canCloseBill && (
              <BillMenu
                label={t('billMore')}
                items={[{ key: 'void', label: t('voidBill'), danger: true, onSelect: () => onVoidBill(bill) }]}
              />
            )}
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

        {showWhole && (
          <footer className="v2-bill-foot">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMarkBill(bill)}>
              {t('markWholePaid')}
            </button>
          </footer>
        )}
      </div>
    </article>
  )
}
