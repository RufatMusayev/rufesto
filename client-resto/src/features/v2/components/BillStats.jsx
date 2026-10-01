import { useTranslation } from 'react-i18next'
import { bakuTodayStartISO } from '../../../lib/time'
import Money from './Money'

export const isActiveBill = b => b.status !== 'paid' && b.status !== 'void'

/** Whether the bill was opened today on the Baku calendar. */
export const isTodayBill = b => Date.parse(b.createdAt) >= Date.parse(bakuTodayStartISO())

/**
 * Money state of the floor: open bills, what is still owed on them, and what
 * came in today. Older bills that are still open count towards "to collect"
 * but not towards "collected today".
 */
export function billTotals(bills) {
  const active = bills.filter(isActiveBill)
  const toCollect = active.reduce((sum, b) => sum + Math.max(0, b.total - b.collected), 0)
  const collected = bills
    .filter(b => b.status !== 'void' && isTodayBill(b))
    .reduce((sum, b) => sum + b.collected, 0)
  return { activeCount: active.length, toCollect, collected }
}

export default function BillStats({ bills }) {
  const { t } = useTranslation('v2')
  const { activeCount, toCollect, collected } = billTotals(bills)
  return (
    <div className="v2-stats">
      <div className="stat-card v2-stat v2-stat--accent">
        <div className="stat-value">{activeCount}</div>
        <div className="stat-label">{t('statActive')}</div>
      </div>
      <div className="stat-card v2-stat v2-stat--gold">
        <div className="stat-value"><Money value={toCollect} /></div>
        <div className="stat-label">{t('statToCollect')}</div>
      </div>
      <div className="stat-card v2-stat v2-stat--green">
        <div className="stat-value"><Money value={collected} /></div>
        <div className="stat-label">{t('statCollected')}</div>
      </div>
    </div>
  )
}
