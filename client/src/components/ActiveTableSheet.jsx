import { useCart } from '../contexts/CartContext'
import { formatPrice } from '../lib/helpers'

export default function ActiveTableSheet({ onClose, tableInfo }) {
  const { items, total, clearTable, activeBookingId } = useCart()

  const subtotal       = total
  const tax_amount     = +(subtotal * 0.18).toFixed(2)
  const service_charge = +(subtotal * 0.10).toFixed(2)
  const total_amount   = +(subtotal + tax_amount + service_charge).toFixed(2)

  function handleEndSession() {
    clearTable()
    onClose()
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}
      style={{ alignItems: 'flex-end' }}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div style={{ padding: '1rem 1.5rem 2.5rem' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 900 }}>
                {tableInfo?.restaurantName || 'Your Table'}
              </h2>
              <p style={{ color: 'var(--t2)', fontSize: '0.82rem', marginTop: 2 }}>
                Table {tableInfo?.tableNumber || '—'} · {tableInfo?.partySize || 1} guest{(tableInfo?.partySize || 1) !== 1 ? 's' : ''}
              </p>
            </div>
            <span style={{
              padding: '3px 10px', borderRadius: 100, fontSize: '0.68rem', fontWeight: 700,
              background: 'rgba(34,197,94,0.12)', color: 'var(--green)',
            }}>SEATED</span>
          </div>

          {/* Order items */}
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--t3)', fontSize: '0.85rem' }}>
              No items ordered yet.<br />
              <span style={{ fontSize: '0.78rem' }}>Browse the menu to add dishes.</span>
            </div>
          ) : (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Current Order
              </div>
              {items.map(i => (
                <div key={i.dish.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.4rem 0', borderBottom: '1px solid var(--border)',
                  fontSize: '0.88rem',
                }}>
                  <span>{i.qty}× {i.dish.name}</span>
                  <span style={{ color: 'var(--t2)' }}>{formatPrice(i.dish.price * i.qty)}</span>
                </div>
              ))}
              <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--t3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span>Subtotal</span><span>{formatPrice(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span>Tax (18%)</span><span>{formatPrice(tax_amount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span>Service (10%)</span><span>{formatPrice(service_charge)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '0.88rem', color: 'var(--t1)', marginTop: 6 }}>
                  <span>Total</span><span style={{ color: 'var(--accent)' }}>{formatPrice(total_amount)}</span>
                </div>
              </div>
            </div>
          )}

          <button className="btn btn-ghost" style={{ width: '100%', marginBottom: '0.5rem' }} onClick={onClose}>
            Back to Menu
          </button>
          <button className="btn btn-danger" style={{ width: '100%' }} onClick={handleEndSession}>
            End Session
          </button>
        </div>
      </div>
    </div>
  )
}
