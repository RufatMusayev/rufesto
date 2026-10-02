import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet, Pill } from '../../../components/ui'
import LoadError from '../../../components/LoadError'
import { formatBakuDateLong } from '../../bookings/timeFormat'
import { getCreditHistory, getBillVisitInfo } from '../api'

const TIER_TONE = { bronze: 'amber', silver: 'gray', gold: 'gold', platinum: 'blue' }
// loyalty_transactions.reason for a settled bill is `bill_paid:<bill id>`; the id is never shown.
const BILL_REASON = /^bill_paid:([0-9a-f-]{36})$/i

function reasonLabel(reason, t, bills) {
  // Any `bill_paid...` reason is a settled bill; without a known restaurant it reads "Bill paid" (never the raw id).
  if (typeof reason === 'string' && reason.startsWith('bill_paid')) {
    const name = bills.get(BILL_REASON.exec(reason)?.[1])?.restaurant
    return name ? t('txBillPaidAt', { name }) : t('txBillPaid')
  }
  if (reason === 'review_posted') return t('txReviewPosted')
  if (reason === 'redeemed') return t('txRedeemed')
  if (!reason) return t('txAdjustment')
  const text = reason.replace(/_/g, ' ')
  return text[0].toUpperCase() + text.slice(1)
}

/** The day shown for a movement: the visit day for a bill (the credit is booked when the bill settles), else when it was booked. */
function txDate(tx, bills) {
  const bill = BILL_REASON.exec(tx.reason || '')
  return (bill && bills.get(bill[1])?.visitedAt) || tx.createdAt
}

/** Resto-Credits: balance, tier, how to earn, and the last ten movements. */
export default function CreditsSheet({ open, onClose, userId, credits }) {
  const { t, i18n } = useTranslation('profile')
  const [state, setState] = useState({ status: 'idle', rows: [], bills: new Map() })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!open || !userId) return undefined
    let alive = true
    setState({ status: 'loading', rows: [], bills: new Map() })
    getCreditHistory(userId).then(async ({ data, error }) => {
      if (!alive) return
      if (error) { setState({ status: 'error', rows: [], bills: new Map() }); return }
      // Restaurant and date of the bills behind "Bill paid" rows (one read, never blocks the list on failure).
      const billIds = data.map(r => BILL_REASON.exec(r.reason || '')?.[1]).filter(Boolean)
      const bills = await getBillVisitInfo(userId, billIds)
      if (alive) setState({ status: 'ready', rows: data, bills })
    })
    return () => { alive = false }
  }, [open, userId, attempt])

  const tier = credits?.tier || 'bronze'
  return (
    <Sheet open={open} onClose={onClose} title={t('restoCredits')}>
      <div className="pf-credits-sum">
        <div>
          <div className="pf-credits-num font-mono">{credits?.points ?? 0}</div>
          <div className="pf-credits-label">{t('creditsAvailable')}</div>
        </div>
        <div>
          <div className="pf-credits-num pf-credits-num-muted font-mono">{credits?.earned ?? 0}</div>
          <div className="pf-credits-label">{t('creditsEarned')}</div>
        </div>
        <div className="pf-credits-tier">
          <Pill tone={TIER_TONE[tier] || 'gray'}>{t(`tier.${tier}`, { defaultValue: tier })}</Pill>
        </div>
      </div>
      <p className="pf-hint">{t('creditsRule')}</p>

      <h3 className="pf-sheet-sub">{t('recentActivity')}</h3>
      {state.status === 'loading' || state.status === 'idle' ? (
        <div aria-busy="true">
          {[1, 2, 3].map(i => <div key={i} className="skeleton pf-sk-tx" />)}
        </div>
      ) : state.status === 'error' ? (
        <LoadError onRetry={() => setAttempt(a => a + 1)} />
      ) : state.rows.length === 0 ? (
        <p className="pf-hint">{t('noActivity')}</p>
      ) : (
        <ul className="pf-tx-list">
          {state.rows.map(tx => (
            <li key={tx.id} className="pf-tx">
              <div>
                <div className="pf-tx-name">{reasonLabel(tx.reason, t, state.bills)}</div>
                <div className="pf-tx-time font-mono">{formatBakuDateLong(txDate(tx, state.bills), i18n.language)}</div>
              </div>
              <span className={`pf-tx-delta font-mono ${tx.delta >= 0 ? 'pos' : 'neg'}`}>
                {tx.delta >= 0 ? `+${tx.delta}` : tx.delta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
