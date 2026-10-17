import { useTranslation } from 'react-i18next'
import { TABLE_COLORS } from '@shared/constants'
import { CLEARED_STATE, tableStateLabel } from './waiterHelpers'
import TableFacts from './TableFacts'

// Every table that has guests, an order or a state worth a look. Cleared tables (paid, guests gone) come first with
// a "Reset table" button for the roles that may change a table's state; the rest show the same facts as My Tables.
export default function AllTablesTab({ tables, facts, acting, canReset, onTake, onReset }) {
  const { t } = useTranslation(['dashboard', 'common'])

  if (tables.length === 0) {
    return <div className="empty"><div className="empty-icon">🍽️</div>{t('dashboard:waiterNoActiveTables')}</div>
  }

  // Cleared first (they need a hand), then the floor in table order (the sort is stable).
  const ordered = [...tables].sort((a, b) => (b.state === CLEARED_STATE) - (a.state === CLEARED_STATE))

  return (
    <div className="wt-grid">
      {ordered.map(tbl => {
        const s = TABLE_COLORS[tbl.state] || TABLE_COLORS.free
        const busy = acting === tbl.table_id
        const cleared = tbl.state === CLEARED_STATE

        return (
          <div key={tbl.table_id} className={`wt-card${tbl.is_mine ? ' is-mine' : ''}`} style={tbl.is_mine ? undefined : { borderColor: s.border }}>
            <div className="wt-card-bar" style={{ background: s.color }} />
            <div className="wt-card-body">
              <div className="wt-card-head">
                <span className="wt-card-title">{t('dashboard:tableLabel', { number: tbl.table_number })}</span>
                <span className="badge" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                  {tableStateLabel(t, tbl.state)}
                </span>
              </div>
              {tbl.section && <div className="wt-card-section">{tbl.section}</div>}

              {cleared ? (
                <>
                  <p className="wt-card-note">{t('dashboard:waiterClearedNote')}</p>
                  {canReset && (
                    <button type="button" className="btn btn-primary btn-sm wt-card-btn" disabled={busy} onClick={() => onReset(tbl.table_id)}>
                      {busy ? <span className="spinner wt-spinner" /> : t('dashboard:waiterResetTable')}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="wt-card-owner">
                    {tbl.is_mine ? (
                      <span className="wt-owner--mine">{t('dashboard:waiterMine')}</span>
                    ) : tbl.assigned_name ? (
                      <span className="wt-owner--name">{tbl.assigned_name}</span>
                    ) : (
                      <span className="wt-owner--none">{t('dashboard:waiterUnassigned')}</span>
                    )}
                  </div>

                  <TableFacts table={tbl} facts={facts[tbl.table_id]} />

                  {!tbl.is_mine && (
                    <button type="button" className="btn btn-ghost btn-sm wt-card-btn" disabled={busy} onClick={() => onTake(tbl.table_id)}>
                      {busy ? <span className="spinner wt-spinner" /> : t('dashboard:waiterTakeTable')}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
