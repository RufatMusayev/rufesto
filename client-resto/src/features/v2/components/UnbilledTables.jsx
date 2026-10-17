import { useTranslation } from 'react-i18next'
import { timeAgo } from '@shared/helpers'
import Money from './Money'

// Tables whose food is served but that have no bill yet: the guest has not opened the bill, so Bills would show
// nothing for them. Lets the cashier see who still has to pay (UnbilledTable view-model, historyApi.js).
export default function UnbilledTables({ tables }) {
  const { t, i18n } = useTranslation(['v2', 'common'])
  if (!tables.length) return null
  return (
    <section className="v2-card v2-unbilled" aria-labelledby="v2-unbilled-title">
      <h2 id="v2-unbilled-title" className="dash-section-title">{t('unbilledTitle', { count: tables.length })}</h2>
      <p className="v2-hint">{t('unbilledHint')}</p>
      <ul className="v2-unbilled-list">
        {tables.map(tb => (
          <li key={tb.tableId} className="v2-unbilled-row">
            <div className="v2-unbilled-main">
              <span className="v2-unbilled-table">{t('common:tableLabel', { number: tb.tableNumber })}</span>
              <span className="v2-unbilled-meta">
                {[
                  tb.sectionName,
                  t('unbilledOrders', { count: tb.orders }),
                  tb.inKitchen > 0 && t('unbilledKitchen', { count: tb.inKitchen }),
                  tb.since && timeAgo(tb.since, i18n.language),
                ].filter(Boolean).join(' · ')}
              </span>
            </div>
            <Money value={tb.amount} strong />
          </li>
        ))}
      </ul>
    </section>
  )
}
