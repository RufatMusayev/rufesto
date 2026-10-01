import { useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import '../i18n'
import '../styles.css'
import { EmptyState, Pill } from '../../../components/ui'
import LoadError from '../../../components/LoadError'
import { useAuth } from '../../../contexts/AuthContext'
import { useCart } from '../../../contexts/CartContext'
import useBill from '../useBill'
import TopBar from '../components/TopBar'
import SignInCard from '../components/SignInCard'
import BillSkeleton from '../components/BillSkeleton'
import BillView from './BillView'

const STATUS_TONE = { open: 'gray', requested: 'amber', paying: 'blue', paid: 'green', void: 'red' }
const STATUS_KEY = {
  open: 'statusOpen', requested: 'statusRequested', paying: 'statusPaying', paid: 'statusPaid', void: 'statusVoid',
}

/**
 * /bill (the bill of the current table session), /bill/:billId and /pay/:billId (deep link). Handles every
 * state around a bill (signed out, nothing to pay, session ended, error, loading); BillView does the rest.
 */
export default function BillPage() {
  const { t } = useTranslation(['bills', 'common'])
  const { billId } = useParams()
  const navigate = useNavigate()
  const { session, loading: authLoading } = useAuth()
  const cart = useCart()
  const tableId = cart?.tableId || null

  // Once a table has been seen on this page the bill stays reachable even if the app clears the table
  // session (leaving the table) a moment before we navigate away.
  const hadTable = useRef(false)
  if (tableId) hadTable.current = true
  const enabled = !!session && (!!billId || hadTable.current)
  const live = useBill({ billId, tableId, enabled })
  const { bill } = live

  let body
  if (authLoading) {
    body = <BillSkeleton />
  } else if (!session) {
    body = <div className="bl-body"><SignInCard /></div>
  } else if (!billId && !hadTable.current) {
    body = (
      <div className="bl-body">
        <EmptyState icon="🧾" title={t('bills:noBillTitle')} body={t('bills:noBillBody')}
          action={<Link to="/table" className="btn btn-primary">{t('bills:backToTable')}</Link>} />
      </div>
    )
  } else if (live.status === 'loading') {
    body = <BillSkeleton />
  } else if (live.status === 'nothing') {
    // nothing_due: every order of the party is already covered (as the old payment sheet showed it)
    body = (
      <div className="bl-body">
        <div className="card state-panel">
          <div className="state-icon state-icon-plain" aria-hidden="true">🧾</div>
          <h2 className="state-title">{t('bills:nothingDueTitle')}</h2>
          <p className="state-body">{t('bills:nothingDueBody')}</p>
          <div className="state-actions">
            <button type="button" className="btn btn-primary" onClick={async () => { await cart?.clearTable?.(true); navigate('/') }}>
              {t('bills:leaveTable')}
            </button>
            <Link to="/table" className="btn btn-ghost">{t('bills:stayAtTable')}</Link>
          </div>
        </div>
      </div>
    )
  } else if (live.status === 'ended') {
    body = (
      <div className="bl-body">
        <EmptyState icon="🍽️" title={t('bills:endedTitle')} body={t('bills:endedBody')}
          action={<Link to="/" className="btn btn-primary">{t('bills:backHome')}</Link>} />
      </div>
    )
  } else if (live.status === 'notFound') {
    body = (
      <div className="bl-body">
        <EmptyState icon="🧾" title={t('bills:notFoundTitle')} body={t('bills:notFoundBody')}
          action={<Link to="/table" className="btn btn-ghost">{t('bills:backToTable')}</Link>} />
      </div>
    )
  } else if (live.status === 'signedout') {
    body = <div className="bl-body"><SignInCard /></div>
  } else if (live.status === 'error' || !bill) {
    body = <div className="bl-body"><LoadError onRetry={live.retry} /></div>
  } else {
    body = (
      <BillView
        key={bill.id} bill={bill} tableId={tableId}
        tableEnded={live.tableEnded} reload={live.reload}
      />
    )
  }

  const pill = bill && STATUS_KEY[bill.status]
    ? <Pill tone={STATUS_TONE[bill.status]}>{t(`bills:${STATUS_KEY[bill.status]}`)}</Pill>
    : null

  return (
    <div className="bl-page">
      <TopBar title={t('bills:billTitle')} right={pill} />
      {body}
    </div>
  )
}
