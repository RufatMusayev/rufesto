import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import { closeBill, fetchBills, markSharePaid, subscribeBills, voidBill } from '../api'
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

// void_bill is for managers and admins only (is_manager_of); every other role never sees the button.
const VOID_ROLES = ['admin', 'manager']

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

// A voided bill takes no more payments.
function withBillVoid(bill) {
  return { ...bill, status: 'void', shares: bill.shares.map(s => ({ ...s, canMarkPaid: false })) }
}

export default function BillsPage() {
  const { restaurantId, staffRow } = useAuth()
  const { t } = useTranslation(['v2', 'dashboard', 'common'])
  const load = useCallback(() => fetchBills(restaurantId), [restaurantId])
  const subscribe = useCallback(resync => subscribeBills(restaurantId, resync), [restaurantId])
  const { data, setData, error, loading, retry, reload } = useLiveList(load, subscribe, restaurantId)

  const [filter, setFilter] = useState('active')
  const [actionError, setActionError] = useState('')
  const [busyShares, setBusyShares] = useState(() => new Set())
  const [confirm, setConfirm] = useState(null) // { kind: 'close' | 'void', bill }
  const [working, setWorking] = useState(false)
  // Guards live in refs: two taps in one tick both see the same render's state, but a ref changes at once.
  const busySharesRef = useRef(new Set())
  const workingRef = useRef(false)
  const canVoid = VOID_ROLES.includes(staffRow?.role)
  const cancelConfirm = useCallback(() => setConfirm(null), [])

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
    if (busySharesRef.current.has(share.id)) return
    busySharesRef.current.add(share.id)
    const before = bills.find(b => b.id === billId)
    setBusy(share.id, true)
    setActionError('')
    setData(list => list.map(b => (b.id === billId ? withSharePaid(b, share.id) : b)))
    try {
      const { error: err } = await markSharePaid(share)
      if (err) {
        setData(list => list.map(b => (b.id === billId && before ? before : b)))
        setActionError(v2Error(err, t))
      }
      reload() // the server's answer replaces the guess, also after a refused write
    } finally {
      busySharesRef.current.delete(share.id)
      setBusy(share.id, false)
    }
  }

  // Confirm button of the dialog: "Mark whole bill paid" (close_bill) or "Void bill" (void_bill).
  async function handleConfirm() {
    const target = confirm
    if (!target || workingRef.current) return
    workingRef.current = true
    const { kind, bill } = target
    const before = bills.find(b => b.id === bill.id)
    setWorking(true)
    setActionError('')
    setData(list => list.map(b => (b.id === bill.id ? (kind === 'void' ? withBillVoid(b) : withBillPaid(b)) : b)))
    try {
      const { error: err } = await (kind === 'void' ? voidBill(bill.id) : closeBill(bill.id))
      if (err) {
        setData(list => list.map(b => (b.id === bill.id && before ? before : b)))
        setActionError(v2Error(err, t))
      }
      reload()
    } finally {
      workingRef.current = false
      setWorking(false)
      setConfirm(null)
    }
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
                <BillCard
                  key={b.id}
                  bill={b}
                  busyShares={busyShares}
                  canVoid={canVoid}
                  onMarkShare={handleMarkShare}
                  onMarkBill={bill => setConfirm({ kind: 'close', bill })}
                  onVoidBill={bill => setConfirm({ kind: 'void', bill })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {confirm && (
        <ConfirmModal
          title={t(confirm.kind === 'void' ? 'confirmVoidTitle' : 'confirmWholeTitle')}
          body={confirm.kind === 'void'
            ? t('confirmVoidBody', { table: confirm.bill.tableNumber, amount: formatPrice(confirm.bill.total) })
            : t('confirmWholeBody', {
              table: confirm.bill.tableNumber,
              amount: formatPrice(Math.max(0, confirm.bill.total - confirm.bill.collected)),
            })}
          confirmLabel={t(confirm.kind === 'void' ? 'voidBill' : 'markWholePaid')}
          danger={confirm.kind === 'void'}
          busy={working}
          onConfirm={handleConfirm}
          onCancel={cancelConfirm}
        />
      )}
    </div>
  )
}
