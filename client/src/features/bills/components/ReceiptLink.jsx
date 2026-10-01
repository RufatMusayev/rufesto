import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import '../i18n'
import '../styles.css'

/** Small row for Profile -> Orders cards: opens the receipt of a bill. */
export default function ReceiptLink({ billId }) {
  const { t } = useTranslation('bills')
  if (!billId) return null
  return (
    <Link to={`/receipt/${billId}`} className="bl-receipt-link">
      <span aria-hidden="true">🧾</span>
      <span>{t('receiptLink')}</span>
      <span aria-hidden="true" className="bl-receipt-link-arrow">›</span>
    </Link>
  )
}
