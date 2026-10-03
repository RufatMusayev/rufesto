import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/ui'
import { useCart } from '../../../contexts/CartContext'
import { formatPrice } from '../../../lib/helpers'
import usePayPlan from '../usePayPlan'
import usePayActions from '../usePayActions'
import PersonShares from '../components/PersonShares'
import SplitModePicker from '../components/SplitModePicker'
import TotalsCard from '../components/TotalsCard'
import TipPicker from '../components/TipPicker'
import WaiterPicker from '../components/WaiterPicker'
import PayMethodList from '../components/PayMethodList'
import PayBar from '../components/PayBar'
import DemoPaySheet from '../components/DemoPaySheet'
import SettledPanel from '../components/SettledPanel'
import ReceptionPanel from '../components/ReceptionPanel'
import WaitingList from '../components/WaitingList'

const ACTIVE = ['open', 'requested', 'paying']

/**
 * A loaded bill: who owes what, how to split it, tip, method, and the states after paying.
 * `onOpenBill` asks the server for a bill again (the guest's own tap: Start a new bill after a void, Add new
 * orders to an unsplit bill); `canOpenBill` is false when the guest is not seated (a deep link), where a new
 * bill cannot be started.
 */
export default function BillView({ bill, tableId, tableEnded, reload, onPaid, onOpenBill, canOpenBill = false }) {
  const { t, i18n } = useTranslation(['bills', 'common'])
  const lang = i18n.language?.startsWith('az') ? 'az' : 'en'
  const navigate = useNavigate()
  const cart = useCart()
  const plan = usePayPlan(bill, tableId, reload)
  const actions = usePayActions({ bill, plan, tableId, reload, onPaid })
  const [sheetOpen, setSheetOpen] = useState(false)
  const [error, setError] = useState(null)          // { key } of the last failed payment attempt
  const [notice, setNotice] = useState('')
  const [leaving, setLeaving] = useState(false)
  const [opening, setOpening] = useState(false)
  const openingRef = useRef(false)              // a double tap asks once

  const active = ACTIVE.includes(bill.status)
  const myPayment = bill.myPayments.find(p => p.status === 'succeeded') || null
  const myPaid = bill.status === 'paid' || bill.myShare?.status === 'paid' || !!myPayment
  const reception = actions.reception
  // "Session ended" only when nothing of mine was paid and no payment is running: a table cleared by the payment
  // itself must never turn a successful (or still settling) payment into that message.
  const ended = tableEnded && !myPaid && !actions.processing
  const canPay = active && !myPaid && !reception && !ended
  const others = bill.shares.filter(s => s.status === 'pending' && s.userId !== bill.people.find(p => p.isMe)?.userId)

  // The table was freed under us (staff ended it): sync the app's table session with the server.
  useEffect(() => {
    if (ended) cart?.refreshTableSession?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended])

  // The bill settled: the server clears the table, so bring the app's table session in line (no-op if it
  // already is). Without it the Table tab would keep showing a table that has been cleared.
  useEffect(() => {
    if (bill.status === 'paid') cart?.refreshTableSession?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill.status])

  async function leave() {
    setLeaving(true)
    await cart?.clearTable?.(true)
    navigate('/')
  }

  async function openBill() {
    if (openingRef.current || !onOpenBill) return
    openingRef.current = true
    setOpening(true)
    try { await onOpenBill() } finally { openingRef.current = false; setOpening(false) }
  }

  async function onPay() {
    setError(null)
    setNotice('')
    if (plan.method === 'reception') {
      const res = await actions.askStaff()
      if (res.error) setError(res.error)
      return
    }
    setSheetOpen(true)
  }

  async function onConfirmDemo() {
    setError(null)
    setNotice('')
    const res = await actions.payDemo()
    if (res.skipped) return
    if (res.error) {
      // the restaurant has demo payments switched off: hide the card row, offer reception
      if (res.error.code === 'demo_disabled') { plan.disableDemo(); setSheetOpen(false) }
      setError(res.error)
      return
    }
    if (res.changed != null) { setNotice(t('bills:demoAmountChanged', { amount: formatPrice(res.changed) })); return }
    setSheetOpen(false)
  }

  // Cancelled by staff: nothing is owed, so no people, shares or pay bar. Starting a new bill is the guest's call.
  if (bill.status === 'void') {
    return (
      <div className="bl-body">
        <section className="card state-panel bl-void" role="status">
          <div className="state-icon state-icon-plain" aria-hidden="true">🚫</div>
          <h2 className="state-title">{t('bills:voidTitle')}</h2>
          <p className="state-body">{t('bills:voidBody')}</p>
          <div className="state-actions">
            {canOpenBill && onOpenBill ? (
              <button type="button" className="btn btn-primary" disabled={opening} onClick={openBill}>
                {opening ? <span className="spinner" aria-hidden="true" /> : null}
                {t('bills:startNewBill')}
              </button>
            ) : null}
            <Link to="/table" className="btn btn-ghost">{t('bills:backToTable')}</Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="bl-body">
      <p className="bl-where">
        {t('bills:where', { restaurant: bill.restaurant.name, table: bill.table.label })}
      </p>

      {ended ? (
        <EmptyState icon="🍽️" title={t('bills:endedTitle')} body={t('bills:endedBody')}
          action={<Link to="/" className="btn btn-primary">{t('bills:backHome')}</Link>} />
      ) : myPaid ? (
        <SettledPanel bill={bill} payment={myPayment} leaving={leaving} onLeave={leave} />
      ) : reception ? (
        <ReceptionPanel amount={reception.amount} busy={leaving} onDone={leave} />
      ) : null}

      {active && bill.newOrdersPending > 0 && !ended ? (
        // nobody has picked a split yet: the guest can add the newer orders to this bill (their tap, not automatic)
        bill.status === 'open' && bill.shares.length === 0 && canOpenBill && onOpenBill ? (
          <div className="bl-note" role="status">
            <p>{t('bills:newOrdersOpen')}</p>
            <button type="button" className="btn btn-ghost bl-note-action" disabled={opening} onClick={openBill}>
              {opening ? <span className="spinner" aria-hidden="true" /> : null}
              {t('bills:addNewOrders')}
            </button>
          </div>
        ) : (
          <p className="bl-note" role="status">{t('bills:newOrdersNote')}</p>
        )
      ) : null}

      <PersonShares people={bill.people} lang={lang} />

      {canPay ? (
        <>
          <SplitModePicker
            modes={bill.modes} memberCount={bill.memberCount} mode={plan.mode}
            locked={plan.locked} canChoose={plan.canSplit} onChange={plan.setMode}
            saving={plan.splitSaving} error={plan.splitError ? t(plan.splitError.key) : ''}
          />
          <TotalsCard bill={bill} />
          {plan.coveredBy !== null ? (
            <section className="card bl-covered" role="status">
              <p>{plan.coveredBy ? t('bills:coveredBy', { name: plan.coveredBy }) : t('bills:coveredByOther')}</p>
              <WaitingList shares={others} />
            </section>
          ) : (
            <>
              {plan.method === 'demo' ? (
                <TipPicker
                  share={plan.share} tipSel={plan.tipSel} customOn={plan.customOn} valid={plan.tipValid}
                  tip={plan.tip} onPercent={plan.setTipPct} onCustom={plan.setTipCustom}
                />
              ) : (
                <p className="bl-hint">{t('bills:tipReceptionNote')}</p>
              )}
              {plan.tip > 0 ? (
                <WaiterPicker waiters={plan.waiters} value={plan.waiterId} onChange={plan.setWaiter} />
              ) : null}
              <PayMethodList method={plan.method} demoOff={plan.demoOff} onChange={plan.setMethod} />
              {error && !sheetOpen ? <p className="bl-error" role="alert">{t(error.key)}</p> : null}
              <PayBar
                share={plan.share} tip={plan.tip} total={plan.total} method={plan.method}
                disabled={!plan.tipValid || plan.splitBusy} busy={actions.processing && !sheetOpen} onPay={onPay}
              />
            </>
          )}
        </>
      ) : (
        <TotalsCard bill={bill} />
      )}

      <DemoPaySheet
        open={sheetOpen && canPay} onClose={() => setSheetOpen(false)}
        share={plan.share} tip={plan.tip} total={plan.total}
        busy={actions.processing} error={error ? t(error.key) : ''} notice={notice}
        onConfirm={onConfirmDemo}
      />
    </div>
  )
}
