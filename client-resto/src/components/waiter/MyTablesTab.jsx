import { useTranslation } from 'react-i18next'
import { formatPrice } from '@shared/helpers'
import { TABLE_COLORS } from '@shared/constants'
import { tableStateLabel } from './waiterHelpers'

export default function MyTablesTab({ tables, acting, onRelease }) {
  const { t } = useTranslation(['dashboard', 'common'])

  if (tables.length === 0) {
    return <div className="empty"><div className="empty-icon">🪑</div>{t('dashboard:waiterNoMyTables')}</div>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '0.75rem' }}>
      {tables.map(tbl => {
        const s = TABLE_COLORS[tbl.state] || TABLE_COLORS.free
        const openCalls = tbl.requests.filter(r => r.status === 'open' || r.status === 'acknowledged').length
        const acting_ = acting === tbl.table_id

        return (
          <div key={tbl.table_id} style={{ background: 'var(--s2)', borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${s.border}` }}>
            <div style={{ height: 2, background: s.color, opacity: 0.6 }} />
            <div style={{ padding: '0.85rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{t('dashboard:tableLabel', { number: tbl.table_number })}</span>
                <span className="badge" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                  {tableStateLabel(t, tbl.state)}
                </span>
              </div>
              {tbl.section && <div style={{ fontSize: '0.7rem', color: 'var(--t3)', marginBottom: 6 }}>{tbl.section}</div>}

              <div style={{ fontSize: '0.78rem', color: 'var(--t2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span>{t('dashboard:bookingGuests', { count: tbl.guests })}</span>
                {tbl.pending_guests > 0 && (
                  <span style={{ color: 'var(--gold)' }}>{t('dashboard:waiterPendingGuests', { count: tbl.pending_guests })}</span>
                )}
                {tbl.outstanding > 0 && (
                  <span style={{ fontWeight: 700, color: 'var(--t1)' }}>{t('dashboard:waiterOutstanding', { amount: formatPrice(tbl.outstanding) })}</span>
                )}
                {openCalls > 0 && (
                  <span style={{ color: 'var(--red)', fontWeight: 600 }}>{t('dashboard:waiterOpenCalls', { count: openCalls })}</span>
                )}
              </div>

              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, width: '100%' }}
                disabled={acting_} onClick={() => onRelease(tbl.table_id)}>
                {acting_ ? <span className="spinner" style={{ width: 12, height: 12 }} /> : t('dashboard:waiterRelease')}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
