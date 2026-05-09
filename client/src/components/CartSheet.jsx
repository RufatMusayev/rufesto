import { useState } from 'react'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { formatPrice } from '../lib/helpers'
import AuthModal from './AuthModal'

export default function CartSheet() {
  const { items, total, open, setOpen, remove, decrement, addDish, placeOrder, placing, restaurantId, tableId } = useCart()
  const { session } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [ordered,  setOrdered]  = useState(false)
  const [error,    setError]    = useState('')

  if (!open) return null

  async function handlePlace() {
    if (!session) { setShowAuth(true); return }
    if (!tableId) { setError('No table selected — scan a QR code first.'); return }
    setError('')
    const { error: err, order } = await placeOrder(restaurantId, tableId)
    if (err) { setError(err); return }
    if (order) setOrdered(true)
  }

  const tax     = total * 0.18
  const service = total * 0.10
  const grand   = total + tax + service

  if (ordered) return (
    <div className="overlay" onClick={() => { setOrdered(false); setOpen(false) }}>
      <div className="sheet" style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: '3rem', margin: '1.25rem 0 0.75rem' }}>✓</div>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.4rem' }}>Order placed!</h2>
        <p style={{ color: 'var(--t2)', fontSize: '0.88rem' }}>Your kitchen ticket is being prepared.</p>
        <button className="btn btn-primary" style={{ marginTop: '1.5rem', width: '100%' }}
          onClick={() => { setOrdered(false); setOpen(false) }}>Done</button>
      </div>
    </div>
  )

  return (
    <>
      <div className="overlay" onClick={e => e.target === e.currentTarget && setOpen(false)}>
        <div className="sheet">
          <div className="sheet-handle" />
          <div style={{ padding: '1rem 1rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Your Order</h2>
              <button onClick={() => setOpen(false)} className="icon-btn">✕</button>
            </div>

            {items.length === 0 ? (
              <div className="empty"><div className="empty-icon">🛒</div>Your cart is empty</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                  {items.map(({ dish, qty }) => (
                    <div key={dish.id} style={{
                      display: 'flex', alignItems: 'center', gap: '0.65rem',
                      padding: '0.65rem',
                      background: 'var(--s2)', borderRadius: 10,
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 8,
                        background: 'var(--s3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.3rem', flexShrink: 0,
                      }}>🍽️</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.86rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dish.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--t2)', fontWeight: 600 }}>{formatPrice(dish.price * qty)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <button onClick={() => decrement(dish.id)} style={{
                          width: 26, height: 26, borderRadius: '50%', background: 'var(--s3)',
                          border: '1px solid var(--border)', color: 'var(--t1)', fontSize: '0.95rem',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>−</button>
                        <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700, fontSize: '0.88rem' }}>{qty}</span>
                        <button onClick={() => addDish(dish)} style={{
                          width: 26, height: 26, borderRadius: '50%',
                          background: 'var(--accent)', border: 'none',
                          color: '#0c0a09', fontSize: '0.95rem',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>+</button>
                        <button onClick={() => remove(dish.id)} style={{
                          width: 26, height: 26, borderRadius: '50%', background: 'rgba(239,68,68,0.08)',
                          border: '1px solid rgba(239,68,68,0.15)', color: 'var(--red)', fontSize: '0.7rem',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div style={{ background: 'var(--s2)', borderRadius: 10, padding: '0.85rem', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                  {[['Subtotal', total], ['VAT (18%)', tax], ['Service (10%)', service]].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.82rem', color: 'var(--t2)' }}>
                      <span>{l}</span><span>{formatPrice(v)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.4rem', borderTop: '1px solid var(--border)', fontWeight: 800, fontSize: '0.95rem' }}>
                    <span>Total</span><span>{formatPrice(grand)}</span>
                  </div>
                </div>

                {error && <p style={{ color: 'var(--red)', fontSize: '0.78rem', marginBottom: '0.65rem' }}>{error}</p>}

                <button className="btn btn-primary" style={{ width: '100%', marginBottom: '1.25rem' }}
                  onClick={handlePlace} disabled={placing}>
                  {placing ? <><span className="spinner" />Placing order…</> : `Place Order · ${formatPrice(grand)}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSuccess={handlePlace} />}
    </>
  )
}
