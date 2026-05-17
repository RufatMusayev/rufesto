import { useState } from 'react'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatPrice } from '../lib/helpers'

const METHODS = [
  { id: 'card', label: 'Credit / Debit Card', icon: CardIcon, digital: true },
  { id: 'apple', label: 'Apple Pay', icon: ApplePayIcon, digital: true },
  { id: 'google', label: 'Google Pay', icon: GooglePayIcon, digital: true },
  { id: 'cash', label: 'Pay Cash', icon: CashIcon, digital: false },
  { id: 'reception', label: 'Pay at Reception', icon: ReceptionIcon, digital: false },
]

export default function PaymentSheet({ order, allOrderIds, onClose, onComplete }) {
  const { session } = useAuth()
  const { clearTable, restaurantId, tableId } = useCart()
  const [selected, setSelected] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState('')

  const total = order?.total_amount || 0

  async function handlePay() {
    if (!selected) return
    setProcessing(true)
    setError('')

    const method = METHODS.find(m => m.id === selected)

    const orderIds = allOrderIds?.length ? allOrderIds : [order.id]

    if (method.digital) {
      await new Promise(r => setTimeout(r, 1800))

      const paymentRows = orderIds.map(oid => ({
        order_id: oid,
        user_id: session.user.id,
        amount: total,
        method: selected,
        status: 'completed',
        paid_at: new Date().toISOString(),
      }))
      const { error: payErr } = await supabase.from('payments').insert(paymentRows)

      if (payErr) { setError(payErr.message); setProcessing(false); return }

      await supabase.from('tables').update({ state: 'cleared' }).eq('id', tableId)
      setSuccess('digital')
    } else {
      const paymentRows = orderIds.map(oid => ({
        order_id: oid,
        user_id: session.user.id,
        amount: total,
        method: selected,
        status: 'pending',
      }))
      const { error: payErr } = await supabase.from('payments').insert(paymentRows)

      if (payErr) { setError(payErr.message); setProcessing(false); return }

      await supabase.from('notifications').insert({
        restaurant_id: restaurantId,
        type: selected === 'cash' ? 'cash_payment_request' : 'reception_payment_request',
        title: selected === 'cash' ? 'Cash Payment Requested' : 'Reception Payment Requested',
        body: `Table requires ${selected === 'cash' ? 'cash collection' : 'reception payment'}. Amount: ${formatPrice(total)}`,
        metadata: JSON.stringify({
          table_id: tableId,
          order_id: order.id,
          amount: total,
          user_id: session.user.id,
        }),
      })

      await supabase.from('tables').update({ state: 'awaiting_payment' }).eq('id', tableId)
      setSuccess(selected)
    }

    setProcessing(false)
  }

  function handleDone() {
    clearTable()
    onComplete?.()
    onClose()
  }

  if (success) return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && handleDone()}>
      <div className="sheet" style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
        <div className="sheet-handle" />

        {success === 'digital' ? (
          <>
            <div style={{ fontSize: '3rem', margin: '1.5rem 0 0.75rem' }}>✓</div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.4rem' }}>
              Payment Complete
            </h2>
            <p style={{ color: 'var(--t2)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              {formatPrice(total)} paid successfully.
            </p>
            <p style={{ color: 'var(--t3)', fontSize: '0.78rem' }}>
              Thank you for dining with us!
            </p>
          </>
        ) : success === 'cash' ? (
          <>
            <div style={{ fontSize: '3rem', margin: '1.5rem 0 0.75rem' }}>💵</div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.4rem' }}>
              Waiter Notified
            </h2>
            <p style={{ color: 'var(--t2)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              A waiter is coming to collect {formatPrice(total)} in cash.
            </p>
            <p style={{ color: 'var(--t3)', fontSize: '0.78rem' }}>
              Please have the amount ready.
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '3rem', margin: '1.5rem 0 0.75rem' }}>🧾</div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.4rem' }}>
              Pay at Reception
            </h2>
            <p style={{ color: 'var(--t2)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              Please proceed to the reception to pay {formatPrice(total)}.
            </p>
            <p style={{ color: 'var(--t3)', fontSize: '0.78rem' }}>
              The staff has been notified.
            </p>
          </>
        )}

        <button className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }}
          onClick={handleDone}>
          Done
        </button>
      </div>
    </div>
  )

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ padding: '1rem 1.25rem 2rem' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Pay Bill</h2>
            <button onClick={onClose} className="icon-btn" style={{ width: 28, height: 28 }}>✕</button>
          </div>

          {/* Amount */}
          <div style={{
            textAlign: 'center', padding: '1.25rem', marginBottom: '1.25rem',
            background: 'var(--s3)', borderRadius: 12,
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--t3)', fontWeight: 600, marginBottom: 4 }}>
              TOTAL AMOUNT
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--t1)' }}>
              {formatPrice(total)}
            </div>
          </div>

          {/* Payment methods */}
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
            Select Payment Method
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1.25rem' }}>
            {METHODS.map(m => (
              <button key={m.id} onClick={() => setSelected(m.id)} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 10,
                background: selected === m.id ? 'rgba(139,45,66,0.08)' : 'var(--s2)',
                border: `1.5px solid ${selected === m.id ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer', transition: 'all 0.15s',
                textAlign: 'left', width: '100%',
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 8,
                  background: 'var(--s3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <m.icon />
                </div>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--t1)', flex: 1 }}>
                  {m.label}
                </span>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: `2px solid ${selected === m.id ? 'var(--accent)' : 'var(--s4)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}>
                  {selected === m.id && (
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)' }} />
                  )}
                </div>
              </button>
            ))}
          </div>

          {error && <p style={{ color: 'var(--red)', fontSize: '0.78rem', marginBottom: '0.75rem' }}>{error}</p>}

          {/* Pay button */}
          <button className="btn btn-primary" style={{ width: '100%', padding: '12px 0', fontSize: '0.92rem' }}
            onClick={handlePay} disabled={!selected || processing}>
            {processing ? (
              <><span className="spinner" /> Processing…</>
            ) : selected === 'cash' ? (
              'Notify Waiter'
            ) : selected === 'reception' ? (
              'Confirm'
            ) : (
              `Pay ${formatPrice(total)}`
            )}
          </button>

          {/* Note for cash/reception */}
          {(selected === 'cash' || selected === 'reception') && (
            <p style={{ fontSize: '0.72rem', color: 'var(--t3)', textAlign: 'center', marginTop: 8 }}>
              {selected === 'cash'
                ? 'A waiter will come to your table to collect payment.'
                : 'Please proceed to the reception desk after confirmation.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function CardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--t1)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}

function ApplePayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--t1)">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C4.24 16.7 4.89 10.93 8.6 10.7c1.22.07 2.07.7 2.78.75.98-.2 1.92-.77 2.97-.7 1.27.1 2.22.6 2.84 1.55-2.56 1.53-1.95 4.89.45 5.83-.55 1.42-1.24 2.83-2.59 4.15zM12.04 10.62c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  )
}

function GooglePayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12.24 10.28V14.1h5.52c-.24 1.26-.96 2.34-2.04 3.06l3.3 2.58c1.92-1.8 3.03-4.42 3.03-7.56 0-.72-.06-1.42-.18-2.1h-9.63z" fill="#4285F4" />
      <path d="M5.52 14.28l-.72.54-2.58 2.01C4.08 20.52 7.8 22.5 12.24 22.5c3.24 0 5.94-1.08 7.92-2.88l-3.3-2.58c-.96.66-2.16 1.02-3.72 1.02-2.88 0-5.34-1.92-6.24-4.56l-.72-.06-.66.06z" fill="#34A853" />
      <path d="M2.22 6.87A10.43 10.43 0 001.5 12c0 1.86.42 3.6 1.2 5.13 1.38-2.4 3.84-4.08 6.72-4.44V10.5H5.52l.48-3.63H2.22z" fill="#FBBC05" />
      <path d="M12.24 5.04c1.62 0 3.06.54 4.2 1.62l3.12-3.12C17.52 1.68 15.12.6 12.24.6 7.8.6 4.08 2.58 2.22 5.87l3.3 2.58c.9-2.64 3.36-4.56 6.24-4.56l.48 1.15z" fill="#EA4335" />
    </svg>
  )
}

function CashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--t1)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M2 10h2M20 10h2M2 14h2M20 14h2" />
    </svg>
  )
}

function ReceptionIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--t1)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M5 21V7l7-4 7 4v14" />
      <rect x="9" y="13" width="6" height="8" />
      <path d="M9 9h6" />
    </svg>
  )
}
