import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { formatPrice, categoryEmoji, dishBackground } from '../lib/helpers'
import AuthModal from './AuthModal'
import BottomSheet, { useSheetClose, useSheetNavigate } from './ui/BottomSheet'
import Img from './ui/Img'
import { OrderTotals, priceOrder, ratesFromAnswer, useOrderRates } from '../features/dinein/mounts'

// The cart drawer. AppLayout mounts it while the cart is open; BottomSheet runs it in self-managed mode, so every way of
// closing (scrim, drag, Esc, Back, X) plays the exit animation and then drops `open` in CartContext, which unmounts this.
export default function CartSheet() {
  const { t } = useTranslation(['cart', 'common'])
  const { items, total, setOpen, remove, decrement, addDish, placeOrder, placing, tableId, restaurantId } = useCart()
  const { session } = useAuth()
  // What the order will cost (VAT and any service charge included), the rule the server applies on place_order.
  const rates = useOrderRates(restaurantId || items[0]?.dish?.restaurant_id || null)
  const [showAuth, setShowAuth] = useState(false)
  // Set to { id, total } once place_order succeeds: the sheet stays open and shows the confirmation.
  const [placed,   setPlaced]   = useState(null)
  const [error,    setError]    = useState('')
  const [submitted, setSubmitted] = useState(false)
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

  function handlePlace() {
    if (!session) { pendingPlaceRef.current = true; setShowAuth(true); return }
    submitOrder()
  }

  const priced = priceOrder(total, rates)
  const grand = priced.total

  const placedRates = placed
    ? ratesFromAnswer({ subtotal: placed.subtotal, tax_amount: placed.taxAmount, service_charge: placed.serviceCharge })
    : null

  const footer = !placed && items.length > 0 ? (
    <>
      {error && <p className="cart-error" role="alert">{error}</p>}
      <button type="button" className="btn btn-primary cart-place" onClick={handlePlace} disabled={placing}>
        {placing ? (
          <><span className="spinner" /> {t('cart:placingOrder')}</>
        ) : (
          t('cart:placeOrder', { price: formatPrice(grand) })
        )}
      </button>
    </>
  ) : null

  return (
    <>
      <BottomSheet
        id="cart"
        onClose={() => setOpen(false)}
        title={placed ? undefined : t('cart:yourOrder')}
        label={placed ? t('cart:orderPlaced') : undefined}
        footer={footer}
      >
        {placed ? (
          <PlacedPanel placed={placed} placedRates={placedRates} />
        ) : items.length === 0 ? (
          <div className="cart-empty">
            <div className="cart-empty-icon" aria-hidden="true">🛒</div>
            <div className="cart-empty-title">{t('cart:cartEmpty')}</div>
            <div className="cart-empty-hint">{t('cart:cartEmptyHint')}</div>
          </div>
        ) : (
          <>
            <div className="cart-list">
              {items.map(({ dish, qty }) => (
                <div key={dish.id} className="cart-row">
                  <div className="cart-thumb" style={dish.photo ? undefined : { background: dishBackground(dish.category) }}>
                    {dish.photo
                      ? <Img src={dish.photo} alt="" ratio={1} />
                      : <span className="cart-thumb-emoji" aria-hidden="true">{categoryEmoji(dish.category)}</span>}
                  </div>

                  <div className="cart-info">
                    <div className="cart-name">{dish.name}</div>
                    <div className="cart-unit">{formatPrice(dish.price)}</div>
                  </div>

                  <span className="cart-line-total">{formatPrice(dish.price * qty)}</span>

                  {/* Qty controls: their own line, so each button can be a full 44px */}
                  <div className="cart-qty">
                    <button
                      type="button" className="cart-qty-btn"
                      onClick={() => decrement(dish.id)}
                      aria-label={t('cart:decrease', { name: dish.name })}
                    >
                      −
                    </button>
                    <span className="cart-qty-num">{qty}</span>
                    <button
                      type="button" className="cart-qty-btn cart-qty-add"
                      onClick={() => addDish(dish)}
                      aria-label={t('cart:increase', { name: dish.name })}
                    >
                      +
                    </button>
                    <button
                      type="button" className="cart-qty-btn cart-qty-del"
                      onClick={() => remove(dish.id)}
                      aria-label={t('cart:remove', { name: dish.name })}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Subtotal, VAT (+ service) and what the guest will pay */}
            <div className="dn-cart-totals">
              <OrderTotals
                subtotal={priced.subtotal} tax={priced.tax} service={priced.service} total={priced.total}
                taxPct={priced.taxRate} servicePct={priced.serviceRate}
                estimate={!rates.exact}
              />
            </div>
          </>
        )}
      </BottomSheet>

      {showAuth && <AuthModal onClose={() => { pendingPlaceRef.current = false; setShowAuth(false) }} onSuccess={() => setShowAuth(false)} />}
    </>
  )
}

/** "Order placed": the confirmation that replaces the cart. Lives inside the sheet, so it can close and navigate it. */
function PlacedPanel({ placed, placedRates }) {
  const { t } = useTranslation(['cart', 'common'])
  const close = useSheetClose()
  const go = useSheetNavigate()
  return (
    <div className="cart-placed">
      <div className="state-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 className="state-title">{t('cart:orderPlaced')}</h2>
      <p className="state-body">{t('cart:orderPlacedHint')}</p>
      <div className="dn-placed">
        <div className="dn-placed-ref">{t('cart:orderRef', { ref: String(placed.id).slice(0, 8).toUpperCase() })}</div>
        <OrderTotals
          subtotal={placed.subtotal} tax={placed.taxAmount} service={placed.serviceCharge} total={placed.total}
          taxPct={placedRates?.taxRate ?? null} servicePct={placedRates?.serviceRate ?? null}
          totalClass="cart-placed-total"
        />
      </div>
      <div className="cart-placed-actions">
        <button type="button" className="btn btn-primary" onClick={() => go('/table')}>{t('cart:goToTable')}</button>
        <button type="button" className="btn btn-ghost" onClick={close}>{t('common:done')}</button>
      </div>
    </div>
  )
}
