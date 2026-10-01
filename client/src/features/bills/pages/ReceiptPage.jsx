import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import '../i18n'
import '../styles.css'
import { EmptyState } from '../../../components/ui'
import LoadError from '../../../components/LoadError'
import { useAuth } from '../../../contexts/AuthContext'
import { getBill } from '../api'
import TopBar from '../components/TopBar'
import SignInCard from '../components/SignInCard'
import ReceiptCard from '../components/ReceiptCard'
import ReviewPrompt from '../components/ReviewPrompt'

function ReceiptSkeleton() {
  return (
    <div className="bl-body" aria-busy="true" aria-hidden="true">
      <div className="skeleton bl-sk-receipt" />
    </div>
  )
}

/** /receipt/:billId: the paper receipt for the payer and the table mates. Not a fiscal receipt unless the bill
 *  carries fiscal data. Print or save with window.print(); the print rule in styles.css keeps only the paper. */
export default function ReceiptPage() {
  const { t, i18n } = useTranslation(['bills', 'common'])
  const lang = i18n.language?.startsWith('az') ? 'az' : 'en'
  const { billId } = useParams()
  const { session, loading: authLoading } = useAuth()
  const uid = session?.user?.id
  const [state, setState] = useState({ status: 'loading', bill: null })

  const load = useCallback(async () => {
    setState({ status: 'loading', bill: null })
    const res = await getBill(billId)
    if (res.error) {
      const status = res.error.code === 'bill_not_found' ? 'notFound' : 'error'
      setState({ status, bill: null })
      return
    }
    setState({ status: 'ready', bill: res.data })
  }, [billId])

  useEffect(() => {
    if (uid) load()
  }, [uid, load])

  let body
  if (authLoading || (uid && state.status === 'loading')) {
    body = <ReceiptSkeleton />
  } else if (!uid) {
    body = <div className="bl-body"><SignInCard /></div>
  } else if (state.status === 'notFound') {
    // also what anyone who is not a party of the bill sees: the server answers bill_not_found for both
    body = (
      <div className="bl-body">
        <EmptyState icon="🧾" title={t('bills:receiptNotFoundTitle')} body={t('bills:receiptNotFoundBody')}
          action={<Link to="/profile" className="btn btn-ghost">{t('bills:receiptToProfile')}</Link>} />
      </div>
    )
  } else if (state.status === 'error' || !state.bill) {
    body = <div className="bl-body"><LoadError onRetry={load} /></div>
  } else if (state.bill.status !== 'paid') {
    body = (
      <div className="bl-body">
        <EmptyState icon="🧾" title={t('bills:receiptNotReadyTitle')} body={t('bills:receiptNotReadyBody')}
          action={<Link to={`/bill/${state.bill.id}`} className="btn btn-primary">{t('bills:viewBill')}</Link>} />
      </div>
    )
  } else {
    body = (
      <div className="bl-body">
        <ReceiptCard bill={state.bill} lang={lang} />
        <div className="bl-receipt-actions bl-noprint">
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>{t('bills:receiptPrint')}</button>
          <Link to="/profile" className="btn btn-ghost">{t('bills:receiptToProfile')}</Link>
        </div>
        <ReviewPrompt bill={state.bill} />
      </div>
    )
  }

  return (
    <div className="bl-page bl-receipt-page">
      <TopBar title={t('bills:receiptTitle')} backTo="/profile" />
      {body}
    </div>
  )
}
