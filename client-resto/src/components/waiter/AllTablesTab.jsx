import { useTranslation } from 'react-i18next'
import { TABLE_COLORS } from '@shared/constants'
import { tableStateLabel } from './waiterHelpers'

export default function AllTablesTab({ tables, acting, onTake }) {
  const { t } = useTranslation(['dashboard', 'common'])

  if (tables.length === 0) {
    return <div className="empty"><div className="empty-icon">🍽️</div>{t('dashboard:waiterNoActiveTables')}</div>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '0.75rem' }}>
      {tables.map(tbl => {
        const s = TABLE_COLORS[tbl.state] || TABLE_COLORS.free
        const acting_ = acting === tbl.table_id

        return (
          <div key={tbl.table_id} style={{
            background: 'var(--s2)', borderRadius: 14, overflow: 'hidden',
            border: tbl.is_mine ? '1.5px solid var(--accent)' : `1.5px solid ${s.border}`,
          }}>
            <div style={{ height: 2, background: s.color, opacity: 0.6 }} />
            <div style={{ padding: '0.85rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{t('dashboard:tableLabel', { number: tbl.table_number })}</span>
                <span className="badge" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                  {tableStateLabel(t, tbl.state)}
                </span>
              </div>
              {tbl.section && <div style={{ fontSize: '0.7rem', color: 'var(--t3)', marginBottom: 8 }}>{tbl.section}</div>}

              <div style={{ fontSize: '0.78rem', marginBottom: 10 }}>
                {tbl.is_mine ? (
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{t('dashboard:waiterMine')}</span>
                ) : tbl.assigned_name ? (
                  <span style={{ color: 'var(--t2)' }}>{tbl.assigned_name}</span>
                ) : (
                  <span style={{ color: 'var(--t3)' }}>{t('dashboard:waiterUnassigned')}</span>
                )}
              </div>

              {!tbl.is_mine && (
                <button className="btn btn-ghost btn-sm" style={{ width: '100%' }}
                  disabled={acting_} onClick={() => onTake(tbl.table_id)}>
                  {acting_ ? <span className="spinner" style={{ width: 12, height: 12 }} /> : t('dashboard:waiterTakeTable')}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
