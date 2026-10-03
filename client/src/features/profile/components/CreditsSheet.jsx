import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet, Pill } from '../../../components/ui'
import LoadError from '../../../components/LoadError'
import { formatBakuDateLong } from '../../bookings/timeFormat'
import { getCreditHistory, getBillVisitInfo, getReviewInfo } from '../api'
import { parseReason } from '../creditReason'

const TIER_TONE = { bronze: 'amber', silver: 'gray', gold: 'gold', platinum: 'blue' }
const EMPTY = { status: 'idle', rows: [], bills: new Map(), reviews: new Map() }

/** One readable line per movement. Ids in the reason only look up a name; they are never printed. */
function reasonLabel(reason, t, { bills, reviews }) {
  const { kind, ref, text } = parseReason(reason)
  if (kind === 'bill') {
    const name = bills.get(ref)?.restaurant
    return name ? t('txBillPaidAt', { name }) : t('txBillPaid')
  }
  if (kind === 'review') {
    const info = reviews.get(ref)
    const name = info?.dish ? (info.restaurant ? `${info.dish} (${info.restaurant})` : info.dish) : info?.restaurant
    return name ? t('txReviewPostedFor', { name }) : t('txReviewPosted')
  }
  if (kind === 'redeemed') return t('txRedeemed')
  if (kind === 'bonus') return t('txBonus')
  if (kind === 'other') return text
  return t('txAdjustment')
}

/** The day shown for a movement: the visit day for a bill (the credit is booked when the bill settles), else when it was booked. */
function txDate(tx, bills) {
  const { kind, ref } = parseReason(tx.reason)
  return (kind === 'bill' && bills.get(ref)?.visitedAt) || tx.createdAt
}

/** Resto-Credits: balance, tier, how to earn, and the last ten movements. */
export default function CreditsSheet({ open, onClose, userId, credits }) {
  const { t, i18n } = useTranslation('profile')
  const [state, setState] = useState(EMPTY)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!open || !userId) return undefined
    let alive = true
    setState({ ...EMPTY, status: 'loading' })
    getCreditHistory(userId).then(async ({ data, error }) => {
      if (!alive) return
      if (error) { setState({ ...EMPTY, status: 'error' }); return }
      // Restaurant and date of the bills, dish and restaurant of the reviews behind the rows (never blocks the list on failure).
      const refs = kind => data.map(r => parseReason(r.reason)).filter(p => p.kind === kind && p.ref).map(p => p.ref)
      const [bills, reviews] = await Promise.all([
        getBillVisitInfo(userId, refs('bill')),
        getReviewInfo(userId, refs('review')),
      ])
      if (alive) setState({ status: 'ready', rows: data, bills, reviews })
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
                <div className="pf-tx-name">{reasonLabel(tx.reason, t, state)}</div>
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
