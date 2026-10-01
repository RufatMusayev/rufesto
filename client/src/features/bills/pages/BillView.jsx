import { useEffect, useState } from 'react'
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

/** A loaded bill: who owes what, how to split it, tip, method, and the states after paying. */
export default function BillView({ bill, tableId, tableEnded, reload }) {
  const { t, i18n } = useTranslation(['bills', 'common'])
  const lang = i18n.language?.startsWith('az') ? 'az' : 'en'
  const navigate = useNavigate()
  const cart = useCart()
  const plan = usePayPlan(bill, tableId)
  const actions = usePayActions({ bill, plan, tableId, reload })
  const [sheetOpen, setSheetOpen] = useState(false)
  const [error, setError] = useState(null)          // { key } of the last failed payment attempt
  const [notice, setNotice] = useState('')
  const [leaving, setLeaving] = useState(false)

  const active = ACTIVE.includes(bill.status)
  const myPayment = bill.myPayments.find(p => p.status === 'succeeded') || null
  const myPaid = bill.status === 'paid' || bill.myShare?.status === 'paid'
  const pendingAtReception = bill.myPayments.find(p => p.status === 'requires_action' && p.provider === 'reception')
  const reception = actions.reception || (pendingAtReception ? { amount: pendingAtReception.amount } : null)
  const ended = tableEnded && !myPaid
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

  if (bill.status === 'void') {
    return (
      <div className="bl-body">
        <EmptyState icon="🚫" title={t('bills:voidTitle')} body={t('bills:voidBody')}
          action={<Link to="/table" className="btn btn-ghost">{t('bills:backToTable')}</Link>} />
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
        <p className="bl-note" role="status">{t('bills:newOrdersNote')}</p>
      ) : null}

      <PersonShares people={bill.people} lang={lang} />

      {canPay ? (
        <>
          <SplitModePicker
            modes={bill.modes} memberCount={bill.memberCount} mode={plan.mode}
            locked={plan.locked} onChange={plan.setMode}
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
                disabled={!plan.tipValid} busy={actions.processing && !sheetOpen} onPay={onPay}
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
