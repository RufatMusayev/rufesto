import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatPrice } from '../../../lib/helpers'

/** The pay-at-reception confirmation (no DEMO badge: nothing here is a demo). */
export default function ReceptionPanel({ amount, busy, onDone }) {
  const { t } = useTranslation('bills')
  return (
    <section className="card state-panel bl-settled" aria-live="polite">
      <div className="state-icon state-icon-plain" aria-hidden="true">🧾</div>
      <h2 className="state-title">{t('receptionTitle')}</h2>
      <p className="state-body">{t('receptionBody', { amount: formatPrice(amount) })}</p>
      <p className="state-note">{t('receptionNote')}</p>
      <div className="state-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onDone}>{t('receptionDone')}</button>
        <Link to="/table" className="btn btn-ghost">{t('backToTable')}</Link>
      </div>
    </section>
  )
}
