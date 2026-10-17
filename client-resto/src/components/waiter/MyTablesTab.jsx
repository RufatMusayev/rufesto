import { useTranslation } from 'react-i18next'
import { TABLE_COLORS } from '@shared/constants'
import { tableStateLabel } from './waiterHelpers'
import TableFacts from './TableFacts'
import TableOrders from './TableOrders'

// My Tables: each card shows who is at the table, what the kitchen is doing, and the orders themselves with a "Mark
// served" button on the ones that are ready, so serving does not need a trip to the Orders page.
export default function MyTablesTab({ tables, facts, orders = {}, acting, canServe = false, onServe, onRelease }) {
  const { t } = useTranslation(['dashboard', 'common'])

  if (tables.length === 0) {
    return <div className="empty"><div className="empty-icon">🪑</div>{t('dashboard:waiterNoMyTables')}</div>
  }

  return (
    <div className="wt-grid">
      {tables.map(tbl => {
        const s = TABLE_COLORS[tbl.state] || TABLE_COLORS.free
        const busy = acting === tbl.table_id

        return (
          <div key={tbl.table_id} className="wt-card" style={{ borderColor: s.border }}>
            <div className="wt-card-bar" style={{ background: s.color }} />
            <div className="wt-card-body">
              <div className="wt-card-head">
                <span className="wt-card-title">{t('dashboard:tableLabel', { number: tbl.table_number })}</span>
                <span className="badge" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                  {tableStateLabel(t, tbl.state)}
                </span>
              </div>
              {tbl.section && <div className="wt-card-section">{tbl.section}</div>}

              <TableFacts table={tbl} facts={facts[tbl.table_id]} />
              <TableOrders orders={orders[tbl.table_id] || []} canServe={canServe} actingId={acting} onServe={onServe} />

              <button type="button" className="btn btn-ghost btn-sm wt-card-btn" disabled={busy} onClick={() => onRelease(tbl.table_id)}>
                {busy ? <span className="spinner wt-spinner" /> : t('dashboard:waiterRelease')}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
