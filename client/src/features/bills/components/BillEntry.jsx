import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import '../i18n'
import '../styles.css'
import { formatPrice } from '../../../lib/helpers'

/** Replaces the "Request bill" button on the Table screen: opens the bill page (/bill). The integrator keeps
 *  the existing "all orders served" condition around it. `total` is the guest's session total, optional. */
export default function BillEntry({ total }) {
  const { t } = useTranslation('bills')
  const hasTotal = total != null && Number.isFinite(Number(total))
  return (
    <Link to="/bill" className="btn btn-primary payment-pulse bl-entry">
      {hasTotal ? t('viewBillAmount', { amount: formatPrice(total) }) : t('viewBill')}
    </Link>
  )
}
