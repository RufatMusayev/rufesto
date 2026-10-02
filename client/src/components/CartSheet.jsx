import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { formatPrice, categoryEmoji, dishBackground } from '../lib/helpers'
import AuthModal from './AuthModal'
import useEscapeClose from './ui/useEscapeClose'

export default function CartSheet() {
  const { t } = useTranslation(['cart', 'common'])
  const { items, total, open, setOpen, remove, decrement, addDish, placeOrder, placing, tableId } = useCart()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [showAuth, setShowAuth] = useState(false)
  // Set to { id, total } once place_order succeeds: the sheet stays open and shows the confirmation.
  const [placed,   setPlaced]   = useState(null)
  const [error,    setError]    = useState('')
  const [submitted, setSubmitted] = useState(false)
  const { handleProps, sheetStyle } = useSwipeDismiss(() => setOpen(false))
  useEscapeClose(() => setOpen(false), open)
  // Tracks "place the order as soon as we're signed in" across the AuthModal round trip.
  // A plain closure passed as AuthModal's onSuccess would capture whatever `session`
  // was in scope when the modal opened (still null) — by the time verifyOtp resolves,
  // AuthContext's session update can lag behind, so calling that stale closure just
  // re-opens the auth modal instead of placing the order. This effect instead reacts
  // to the *committed* session value once it actually changes.
  const pendingPlaceRef = useRef(false)

  async function submitOrder() {
    if (!tableId) { setError(t('cart:noTableError')); return }
    if (submitted) return
    setSubmitted(true)
    setError('')
    const { error: err, order } = await placeOrder(tableId)
    setSubmitted(false)
    if (err) { setError(err); return }
    if (order) setPlaced(order)
  }

  useEffect(() => {
    if (session && pendingPlaceRef.current) {
      pendingPlaceRef.current = false
      setShowAuth(false)
      submitOrder()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // Any way of closing the sheet (overlay, swipe, X) must also drop the confirmation, so the
  // next open shows the cart again instead of a stale "Order placed" panel.
  useEffect(() => {
    if (!open) setPlaced(null)
  }, [open])

  if (!open) return null

  function handlePlace() {
    if (!session) { pendingPlaceRef.current = true; setShowAuth(true); return }
    submitOrder()
  }

  const grand = total

  if (placed) return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && setOpen(false)}>
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
            {t('cart:orderPlaced')}
          </h2>
          <p style={{ color: 'var(--t2)', fontSize: '0.86rem', lineHeight: 1.5 }}>
            {t('cart:orderPlacedHint')}
          </p>
        </div>
        <div className="cart-placed-summary">
          <span className="cart-placed-ref">{t('cart:orderRef', { ref: String(placed.id).slice(0, 8).toUpperCase() })}</span>
          <span className="cart-placed-total">{formatPrice(placed.total)}</span>
        </div>
        <div className="cart-placed-actions">
          <button className="btn btn-primary" onClick={() => { setOpen(false); navigate('/table') }}>
            {t('cart:goToTable')}
          </button>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>
            {t('common:done')}
          </button>
        </div>
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
                {t('cart:yourOrder')}
              </h2>
              <button onClick={() => setOpen(false)} className="icon-btn" aria-label={t('common:close')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 0', color: 'var(--t3)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 10, opacity: 0.5 }}>🛒</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>{t('cart:cartEmpty')}</div>
                <div style={{ fontSize: '0.78rem' }}>{t('cart:cartEmptyHint')}</div>
              </div>
            ) : (
              <>
                {/* Items list */}
                <div style={{ marginBottom: '1rem' }}>
                  {items.map(({ dish, qty }) => (
                    <div key={dish.id} className="cart-row">
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
                      <div className="cart-info">
                        <div className="cart-name">{dish.name}</div>
                        <div className="cart-unit">{formatPrice(dish.price)}</div>
                      </div>

                      {/* Line total */}
                      <span className="cart-line-total">{formatPrice(dish.price * qty)}</span>

                      {/* Qty controls: their own line, so each button can be a full 44px */}
                      <div className="cart-qty">
                        <button
                          type="button"
                          className="cart-qty-btn"
                          onClick={() => decrement(dish.id)}
                          aria-label={t('cart:decrease', { name: dish.name })}
                        >
                          −
                        </button>
                        <span className="cart-qty-num">{qty}</span>
                        <button
                          type="button"
                          className="cart-qty-btn cart-qty-add"
                          onClick={() => addDish(dish)}
                          aria-label={t('cart:increase', { name: dish.name })}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="cart-qty-btn cart-qty-del"
                          onClick={() => remove(dish.id)}
                          aria-label={t('cart:remove', { name: dish.name })}
                        >
                          ✕
                        </button>
                      </div>
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
                  <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--t2)' }}>{t('common:total')}</span>
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
                    <><span className="spinner" /> {t('cart:placingOrder')}</>
                  ) : (
                    t('cart:placeOrder', { price: formatPrice(grand) })
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showAuth && <AuthModal onClose={() => { pendingPlaceRef.current = false; setShowAuth(false) }} onSuccess={() => setShowAuth(false)} />}
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
