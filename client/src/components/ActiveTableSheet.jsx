import { useState, useEffect } from 'react'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatPrice } from '../lib/helpers'
import PaymentSheet from './PaymentSheet'

const ORDER_STATUS_META = {
  open:      { label: 'Placed',    color: '#3b82f6', bg: 'rgba(59,130,246,0.08)'  },
  preparing: { label: 'Preparing', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)'  },
  ready:     { label: 'Ready',     color: '#22c55e', bg: 'rgba(34,197,94,0.08)'   },
  served:    { label: 'Served',    color: '#22c55e', bg: 'rgba(34,197,94,0.08)'   },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.08)'   },
}

export default function ActiveTableSheet({ onClose, tableInfo }) {
  const { items, total, clearTable, activeBookingId, restaurantId, tableId } = useCart()
  const { session } = useAuth()
  const [showPayment, setShowPayment] = useState(false)
  const [orders, setOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(true)

  useEffect(() => {
    if (!session || !tableId) { setLoadingOrders(false); return }
    supabase
      .from('orders')
      .select('id, status, total_amount, placed_at')
      .eq('table_id', tableId)
      .eq('user_id', session.user.id)
      .in('status', ['open', 'preparing', 'ready'])
      .order('placed_at', { ascending: false })
      .then(({ data }) => { setOrders(data || []); setLoadingOrders(false) })
  }, [session, tableId])

  const billTotal = orders.reduce((s, o) => s + (o.total_amount || 0), 0)
  const hasBill = orders.length > 0

  function handleEndSession() {
    clearTable()
    onClose()
  }

  function handlePaymentComplete() {
    setShowPayment(false)
    clearTable()
    onClose()
  }

  const subtotal       = total
  const tax_amount     = +(subtotal * 0.18).toFixed(2)
  const service_charge = +(subtotal * 0.10).toFixed(2)
  const total_amount   = +(subtotal + tax_amount + service_charge).toFixed(2)

  return (
    <>
      <div
        className="overlay"
        onClick={e => e.target === e.currentTarget && onClose()}
        style={{ alignItems: 'flex-end' }}
      >
        <div className="sheet">
          <div className="sheet-handle" />
          <div style={{ padding: '1rem 1.5rem 2.5rem' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '1.2rem', fontWeight: 700, color: 'var(--t1)',
                }}>
                  {tableInfo?.restaurantName || 'Your Table'}
                </h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--t3)', marginTop: 3 }}>
                  Table{' '}
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                    {tableInfo?.tableNumber || '—'}
                  </span>
                  {' '}· {tableInfo?.partySize || 1} guest{(tableInfo?.partySize || 1) !== 1 ? 's' : ''}
                </p>
              </div>
              <span className="avail-badge on" style={{ fontSize: '0.62rem', letterSpacing: 0.5 }}>
                SEATED
              </span>
            </div>

            {/* Placed orders */}
            {loadingOrders ? (
              <div style={{ marginBottom: '1rem' }}>
                <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 8, borderRadius: 4 }} />
                <div className="skeleton" style={{ height: 12, width: '40%', borderRadius: 4 }} />
              </div>
            ) : hasBill ? (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{
                  fontSize: '0.68rem', fontWeight: 700, color: 'var(--t4)',
                  textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
                }}>
                  Active Orders
                </div>
                {orders.map(o => {
                  const meta = ORDER_STATUS_META[o.status] || ORDER_STATUS_META.open
                  const time = o.placed_at
                    ? new Date(o.placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : ''
                  return (
                    <div key={o.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 0', borderBottom: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: '0.62rem', fontWeight: 700,
                          padding: '2px 8px', borderRadius: 100,
                          background: meta.bg, color: meta.color,
                        }}>
                          {meta.label}
                        </span>
                        {time && (
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.68rem', color: 'var(--t4)' }}>
                            {time}
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontFamily: "'DM Mono', monospace",
                        fontWeight: 700, color: 'var(--accent)', fontSize: '0.86rem',
                      }}>
                        {formatPrice(o.total_amount)}
                      </span>
                    </div>
                  )
                })}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  marginTop: 10, fontWeight: 800, fontSize: '0.92rem',
                }}>
                  <span style={{ color: 'var(--t1)' }}>Bill Total</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--accent)' }}>
                    {formatPrice(billTotal)}
                  </span>
                </div>
              </div>
            ) : null}

            {/* Cart items (pending, not yet ordered) */}
            {items.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{
                  fontSize: '0.68rem', fontWeight: 700, color: 'var(--t4)',
                  textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
                }}>
                  In Cart (Not Ordered)
                </div>
                {items.map(i => (
                  <div key={i.dish.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '7px 0', borderBottom: '1px solid var(--border)',
                    fontSize: '0.86rem',
                  }}>
                    <span style={{ color: 'var(--t1)' }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--t3)' }}>{i.qty}×</span>{' '}
                      {i.dish.name}
                    </span>
                    <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--t2)' }}>
                      {formatPrice(i.dish.price * i.qty)}
                    </span>
                  </div>
                ))}

                {/* Cart subtotals */}
                <div style={{ marginTop: 10 }}>
                  {[
                    ['Subtotal', subtotal],
                    ['Tax (18%)', tax_amount],
                    ['Service (10%)', service_charge],
                  ].map(([label, val]) => (
                    <div key={label} style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: '0.76rem', color: 'var(--t4)', marginBottom: 3,
                    }}>
                      <span>{label}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace" }}>{formatPrice(val)}</span>
                    </div>
                  ))}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontWeight: 800, fontSize: '0.9rem', color: 'var(--t1)', marginTop: 6,
                    paddingTop: 6, borderTop: '1px solid var(--border)',
                  }}>
                    <span>Total</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--accent)' }}>
                      {formatPrice(total_amount)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {items.length === 0 && !hasBill && (
              <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--t3)', fontSize: '0.85rem' }}>
                No items ordered yet.
                <br />
                <span style={{ fontSize: '0.78rem' }}>Browse the menu to add dishes.</span>
              </div>
            )}

            {/* Request Bill button */}
            {hasBill && (
              <button
                className="btn btn-primary payment-pulse"
                style={{ width: '100%', marginBottom: '0.6rem', padding: '13px 0', fontSize: '0.9rem' }}
                onClick={() => setShowPayment(true)}
              >
                Request Bill · {formatPrice(billTotal)}
              </button>
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

      {showPayment && orders.length > 0 && (
        <PaymentSheet
          order={{ id: orders[0].id, total_amount: billTotal }}
          allOrderIds={orders.map(o => o.id)}
          onClose={() => setShowPayment(false)}
          onComplete={handlePaymentComplete}
        />
      )}
    </>
  )
}
