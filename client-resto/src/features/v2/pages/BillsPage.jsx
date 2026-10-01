import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import { closeBill, fetchBills, markSharePaid, subscribeBills } from '../api'
import { v2Error } from '../errors'
import useLiveList from '../hooks/useLiveList'
import BillCard from '../components/BillCard'
import BillStats, { isActiveBill } from '../components/BillStats'
import ConfirmModal from '../components/ConfirmModal'
import EmptyBlock from '../components/EmptyBlock'
import ErrorBanner from '../components/ErrorBanner'
import LoadError from '../components/LoadError'
import { formatPrice } from '@shared/helpers'
import '../styles.css'

const FILTERS = ['active', 'paid', 'all']

const matches = {
  active: b => isActiveBill(b),
  paid: b => b.status === 'paid',
  all: () => true,
}

// Applies "this share is paid" to a bill locally; the server stays the authority
// and the next reload replaces this guess.
function withSharePaid(bill, shareId) {
  const shares = bill.shares.map(s => (s.id === shareId ? { ...s, paid: true, canMarkPaid: false } : s))
  const collected = shares.filter(s => s.paid).reduce((sum, s) => sum + s.amount, 0)
  const allPaid = shares.length > 0 && shares.every(s => s.paid)
  return { ...bill, shares, collected, status: allPaid ? 'paid' : bill.status }
}

function withBillPaid(bill) {
  const shares = bill.shares.map(s => ({ ...s, paid: true, canMarkPaid: false }))
  return { ...bill, shares, collected: shares.reduce((sum, s) => sum + s.amount, 0), status: 'paid' }
}

export default function BillsPage() {
  const { restaurantId } = useAuth()
  const { t } = useTranslation(['v2', 'dashboard', 'common'])
  const load = useCallback(() => fetchBills(restaurantId), [restaurantId])
  const subscribe = useCallback(resync => subscribeBills(restaurantId, resync), [restaurantId])
  const { data, setData, error, loading, retry, reload } = useLiveList(load, subscribe, restaurantId)

  const [filter, setFilter] = useState('active')
  const [actionError, setActionError] = useState('')
  const [busyShares, setBusyShares] = useState(() => new Set())
  const [confirmBill, setConfirmBill] = useState(null)
  const [closing, setClosing] = useState(false)

  const bills = data || []
  const counts = { active: bills.filter(matches.active).length, paid: bills.filter(matches.paid).length, all: bills.length }
  const visible = bills.filter(matches[filter])

  function setBusy(id, on) {
    setBusyShares(prev => {
      const next = new Set(prev)
      if (on) next.add(id); else next.delete(id)
      return next
    })
  }

  async function handleMarkShare(billId, share) {
    if (busyShares.has(share.id)) return
    const before = bills.find(b => b.id === billId)
    setBusy(share.id, true)
    setActionError('')
    setData(list => list.map(b => (b.id === billId ? withSharePaid(b, share.id) : b)))
    const { error: err } = await markSharePaid(share)
    if (err) {
      setData(list => list.map(b => (b.id === billId ? before : b)))
      setActionError(v2Error(err, t))
    }
    reload() // the server's answer replaces the guess, also after a refused write
    setBusy(share.id, false)
  }

  async function handleCloseBill() {
    const bill = confirmBill
    if (!bill || closing) return
    const before = bills.find(b => b.id === bill.id)
    setClosing(true)
    setActionError('')
    setData(list => list.map(b => (b.id === bill.id ? withBillPaid(b) : b)))
    const { error: err } = await closeBill(bill.id)
    if (err) {
      setData(list => list.map(b => (b.id === bill.id ? before : b)))
      setActionError(v2Error(err, t))
    }
    reload()
    setClosing(false)
    setConfirmBill(null)
  }

  return (
    <div className="v2-page">
      <div className="v2-page-head">
        <h1 className="page-title">{t('billsTitle')}</h1>
        {data && <span className="v2-page-count">{t('billCount', { count: counts.all })}</span>}
      </div>

      <ErrorBanner message={actionError} onDismiss={() => setActionError('')} />

      {loading ? (
        <div aria-hidden="true">
          <div className="v2-stats">
            {[0, 1, 2].map(i => <div key={i} className="skeleton v2-skel-stat" />)}
          </div>
          {[0, 1].map(i => <div key={i} className="skeleton v2-skel-card" />)}
        </div>
      ) : !data ? (
        <LoadError message={v2Error(error, t)} onRetry={retry} />
      ) : (
        <>
          <BillStats bills={bills} />

          <div className="v2-chips no-scrollbar" role="group" aria-label={t('billsTitle')}>
            {FILTERS.map(f => (
              <button key={f} type="button" className={`chip${filter === f ? ' active' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(`filter_${f}`, { count: counts[f] })}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyBlock icon="🧾" title={bills.length === 0 ? t('noBillsToday') : t('noBillsFilter')} />
          ) : (
            <div className="v2-bill-list">
              {visible.map(b => (
                <BillCard key={b.id} bill={b} busyShares={busyShares} onMarkShare={handleMarkShare} onMarkBill={setConfirmBill} />
              ))}
            </div>
          )}
        </>
      )}

      {confirmBill && (
        <ConfirmModal
          title={t('confirmWholeTitle')}
          body={t('confirmWholeBody', {
            table: confirmBill.tableNumber,
            amount: formatPrice(Math.max(0, confirmBill.total - confirmBill.collected)),
          })}
          confirmLabel={t('markWholePaid')}
          busy={closing}
          onConfirm={handleCloseBill}
          onCancel={() => setConfirmBill(null)}
        />
      )}
    </div>
  )
}
