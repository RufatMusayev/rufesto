import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import '../i18n'
import '../styles.css'
import { Pill } from '../../../components/ui'
import { useCart } from '../../../contexts/CartContext'
import { formatPrice } from '../../../lib/helpers'
import useTableBill from '../useTableBill'
import { STATUS_KEY, STATUS_TONE } from '../status'

/** Replaces the "Request bill" button on the Table screen: opens the bill page (/bill). The integrator keeps
 *  the existing "all orders served" condition around it. `total` is the guest's session total, optional.
 *  It follows the server's bill (also after a reload): in progress shows its status, settled links to the
 *  receipt, cancelled by staff says so and offers a new bill (the guest's tap: /bill opens it). */
export default function BillEntry({ total }) {
  const { t } = useTranslation('bills')
  const cart = useCart()
  const bill = useTableBill({ tableId: cart?.tableId || null, since: cart?.startedAt || null })
  const status = bill?.status || null
  const hasTotal = total != null && Number.isFinite(Number(total))

  if (status === 'void') {
    return (
      <>
        <p className="bl-entry-void" role="status">{t('voidTitle')}</p>
        <Link to="/bill" className="btn btn-primary bl-entry">{t('startNewBill')}</Link>
      </>
    )
  }
  if (status === 'paid') {
    return <Link to={`/receipt/${bill.id}`} className="btn btn-primary bl-entry">{t('viewReceipt')}</Link>
  }
  return (
    <>
      {status === 'requested' || status === 'paying' ? (
        <p className="bl-entry-status" role="status">
          <Pill tone={STATUS_TONE[status]}>{t(STATUS_KEY[status])}</Pill>
        </p>
      ) : null}
      <Link to="/bill" className="btn btn-primary payment-pulse bl-entry">
        {hasTotal ? t('viewBillAmount', { amount: formatPrice(total) }) : t('viewBill')}
      </Link>
    </>
  )
}
