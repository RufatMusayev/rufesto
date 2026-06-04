import { useState, useRef } from 'react'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { formatPrice, categoryEmoji, dishBackground } from '../lib/helpers'
import AuthModal from './AuthModal'

export default function CartSheet() {
  const { items, total, open, setOpen, remove, decrement, addDish, placeOrder, placing, restaurantId, tableId, activeBookingId } = useCart()
  const { session } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [ordered,  setOrdered]  = useState(false)
  const [error,    setError]    = useState('')
  const [submitted, setSubmitted] = useState(false)
  const { handleProps, sheetStyle } = useSwipeDismiss(() => setOpen(false))

  if (!open) return null

  async function handlePlace() {
    if (!session) { setShowAuth(true); return }
    if (!tableId) { setError('No table selected — scan a QR code first.'); return }
    if (submitted) return
    setSubmitted(true)
    setError('')
    const { error: err, order } = await placeOrder(restaurantId, tableId, activeBookingId)
    setSubmitted(false)
    if (err) { setError(err); return }
    if (order) setOrdered(true)
  }

  const grand = total

  if (ordered) return (
    <div className="overlay" onClick={() => { setOrdered(false); setOpen(false) }}>
      <div className="sheet" style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
        <div className="sheet-handle" />
        <div style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(196,154,44,0.12)', border: '1px solid var(--gold)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.3rem', fontWeight: 700, marginBottom: 6, color: 'var(--t1)' }}>
            Order placed!
          </h2>
          <p style={{ color: 'var(--t2)', fontSize: '0.86rem', lineHeight: 1.5 }}>
            Your kitchen ticket is being prepared. We'll keep you updated.
          </p>
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }}
          onClick={() => { setOrdered(false); setOpen(false) }}>
          Done
        </button>
      </div>
    </div>
  )

  return (
    <>
      <div className="overlay" onClick={e => e.target === e.currentTarget && setOpen(false)}>
        <div className="sheet" style={sheetStyle}>
          <div className="sheet-handle" {...handleProps} />
          <div style={{ padding: '1rem 1rem 0' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '1.2rem', fontWeight: 700, color: 'var(--t1)',
              }}>
                Your Order
              </h2>
              <button onClick={() => setOpen(false)} className="icon-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 0', color: 'var(--t3)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 10, opacity: 0.5 }}>🛒</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Your cart is empty</div>
                <div style={{ fontSize: '0.78rem' }}>Browse the menu and add something delicious.</div>
              </div>
            ) : (
              <>
                {/* Items list */}
                <div style={{ marginBottom: '1rem' }}>
                  {items.map(({ dish, qty }) => (
                    <div key={dish.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 0', borderBottom: '1px solid var(--border)',
                    }}>
                      {/* Dish icon / photo */}
                      <div style={{
                        width: 40, height: 40, borderRadius: 8,
                        background: dish.photo ? '#000' : dishBackground(dish.category),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.2rem', flexShrink: 0, overflow: 'hidden',
                        position: 'relative',
                      }}>
                        {dish.photo ? (
                          <img src={dish.photo} alt={dish.name} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                        ) : (
                          categoryEmoji(dish.category)
                        )}
                      </div>

                      {/* Name + unit price */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '0.86rem', fontWeight: 600, color: 'var(--t1)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {dish.name}
                        </div>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.76rem', color: 'var(--t3)' }}>
                          {formatPrice(dish.price)}
                        </div>
                      </div>

                      {/* Qty controls */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          onClick={() => decrement(dish.id)}
                          style={{
                            width: 26, height: 26, borderRadius: '50%',
                            border: '1px solid var(--border)', background: 'var(--s3)',
                            color: 'var(--t1)', fontSize: '1rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          −
                        </button>
                        <span style={{
                          fontFamily: "'DM Mono', monospace",
                          fontSize: '0.86rem', minWidth: 20, textAlign: 'center', fontWeight: 700,
                        }}>
                          {qty}
                        </span>
                        <button
                          onClick={() => addDish(dish)}
                          style={{
                            width: 26, height: 26, borderRadius: '50%',
                            border: 'none', background: 'var(--accent)',
                            color: '#F5F0E8', fontSize: '1rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          +
                        </button>
                        <button
                          onClick={() => remove(dish.id)}
                          style={{
                            width: 26, height: 26, borderRadius: '50%',
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.15)',
                            color: 'var(--red)', fontSize: '0.7rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          ✕
                        </button>
                      </div>

                      {/* Line total */}
                      <span style={{
                        fontFamily: "'DM Mono', monospace",
                        fontSize: '0.86rem', fontWeight: 600, color: 'var(--t1)',
                        minWidth: 56, textAlign: 'right',
                      }}>
                        {formatPrice(dish.price * qty)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div style={{
                  background: 'var(--s2)', borderRadius: 10,
                  padding: '12px 14px', border: '1px solid var(--border)',
                  marginBottom: '1rem',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--t2)' }}>Total</span>
                  <span style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)',
                  }}>
                    {formatPrice(grand)}
                  </span>
                </div>

                {error && (
                  <p style={{ color: 'var(--red)', fontSize: '0.78rem', marginBottom: 10 }}>{error}</p>
                )}

                <button
                  className="btn btn-primary"
                  style={{ width: '100%', marginBottom: '1.25rem', fontSize: '0.92rem' }}
                  onClick={handlePlace}
                  disabled={placing}
                  onPointerDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
                  onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
                  onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {placing ? (
                    <><span className="spinner" /> Placing order…</>
                  ) : (
                    `Place Order · ${formatPrice(grand)}`
                  )}
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

// Swipe-down-to-dismiss on the sheet grab handle. Pointer-based (mouse + touch),
// dismisses on distance > 110px OR downward flick velocity > 0.11 px/ms; upward
// drag is damped (4x) so it resists past the natural boundary. Snap-back uses ease-out.
function useSwipeDismiss(onClose) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef({ y: 0, t: 0, id: null })

  function onPointerDown(e) {
    start.current = { y: e.clientY, t: Date.now(), id: e.pointerId }
    setDragging(true)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  }
  function onPointerMove(e) {
    if (!dragging || e.pointerId !== start.current.id) return
    let dy = e.clientY - start.current.y
    if (dy < 0) dy = dy / 4
    setDragY(dy)
  }
  function end(e) {
    if (!dragging || e.pointerId !== start.current.id) return
    const dy = e.clientY - start.current.y
    const dt = Date.now() - start.current.t || 1
    const velocity = dy / dt
    setDragging(false)
    if (dy > 110 || velocity > 0.11) { setDragY(0); onClose() }
    else setDragY(0)
  }

  return {
    handleProps: {
      onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end,
      style: { touchAction: 'none', cursor: 'grab', padding: '8px 0' },
    },
    sheetStyle: {
      transform: dragY ? `translateY(${dragY}px)` : undefined,
      transition: dragging ? 'none' : 'transform 240ms cubic-bezier(0.23,1,0.32,1)',
    },
  }
}
