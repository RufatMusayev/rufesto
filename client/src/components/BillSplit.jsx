import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatPrice } from '../lib/helpers'

// Presentational bill-split picker for PaymentSheet: PaymentSheet owns the
// table_bill() fetch and the selected mode so it can derive the payable total and
// keep the two in sync. Renders nothing for a solo guest (member_count <= 1).
export default function BillSplit({ bill, mode, onSelectMode }) {
  const { t, i18n } = useTranslation(['payment', 'common'])
  const lang = i18n.language?.startsWith('az') ? 'az' : 'en'
  const [expanded, setExpanded] = useState(false)

  if (!bill || bill.member_count <= 1) return null

  const OPTIONS = [
    { id: 'own',   label: t('payment:splitOwn'), amount: bill.my_own },
    { id: 'equal', label: t('payment:splitEqual', { count: bill.member_count }), amount: bill.equal_share },
    { id: 'all',   label: t('payment:splitAll'), amount: bill.table_total },
  ]

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: '0.6rem' }}>
        {t('payment:splitTitle')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
        {OPTIONS.map(o => (
          <button
            key={o.id}
            onClick={() => onSelectMode(o.id)}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 12,
              border: `1.5px solid ${mode === o.id ? 'var(--accent)' : 'var(--border)'}`,
              background: mode === o.id ? 'rgba(139,45,66,0.08)' : 'var(--s2)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: 'pointer', textAlign: 'left',
              transition: 'all 150ms var(--ease-out)',
            }}
          >
            <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--t1)' }}>{o.label}</span>
            <span style={{
              fontFamily: "'DM Mono', monospace", fontSize: '0.86rem', fontWeight: 700,
              color: mode === o.id ? 'var(--accent)' : 'var(--t2)',
            }}>
              {formatPrice(o.amount)}
            </span>
          </button>
        ))}
      </div>

      <button
        onClick={() => setExpanded(v => !v)}
        className="btn btn-ghost"
        style={{ width: '100%', fontSize: '0.76rem', padding: '6px 0' }}
      >
        {expanded ? t('payment:hideBreakdown') : t('payment:showBreakdown')}
      </button>

      {expanded && (
        <div style={{ marginTop: 8, background: 'var(--s2)', borderRadius: 10, border: '1px solid var(--border)', padding: '10px 12px' }}>
          {bill.people.map((p, idx) => (
            <div key={p.name + idx} style={{ marginBottom: idx < bill.people.length - 1 ? 10 : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>
                <span>
                  {p.name}
                  {p.is_host && <span style={{ marginLeft: 4 }}>👑</span>}
                  {p.is_me && <span style={{ color: 'var(--t3)', fontWeight: 400 }}> ({t('common:you')})</span>}
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace" }}>{formatPrice(p.amount_due)}</span>
              </div>
              {(p.items || []).map(it => (
                <div key={it.dish_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--t3)', paddingLeft: 8, marginTop: 2 }}>
                  <span>{it.quantity}× {it.name_i18n?.[lang] || it.name}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace" }}>{formatPrice(it.line_total)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
