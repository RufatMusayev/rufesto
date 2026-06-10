import { useEffect, useState } from 'react'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatPrice } from '../lib/helpers'

const METHODS = [
  { id: 'card',      label: 'Credit / Debit Card', icon: CardIcon,      digital: true  },
  { id: 'apple',     label: 'Apple Pay',            icon: ApplePayIcon,  digital: true  },
  { id: 'google',    label: 'Google Pay',            icon: GooglePayIcon, digital: true  },
  { id: 'cash',      label: 'Pay Cash',              icon: CashIcon,      digital: false },
  { id: 'reception', label: 'Pay at Reception',      icon: ReceptionIcon, digital: false },
]

export default function PaymentSheet({ order, allOrderIds, onClose, onComplete }) {
  const { session } = useAuth()
  const { clearTable, restaurantId, tableId } = useCart()
  const [selected, setSelected] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState('')
  const [credits, setCredits] = useState(0)
  const [useCredits, setUseCredits] = useState(false)
  const [creditError, setCreditError] = useState('')
  const [appliedDiscount, setAppliedDiscount] = useState(0)

  const total = order?.total_amount || 0

  useEffect(() => {
    if (!session) return
    supabase
      .from('loyalty_accounts')
      .select('points')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setCredits(data?.points || 0))
      .catch(() => {})
  }, [session?.user?.id])

  // Usable credits: capped by order total, rounded down to nearest 100 (100 credits = ₼1)
  const usablePoints = Math.floor(Math.min(credits, Math.round(total * 100)) / 100) * 100
  const creditDiscount = usablePoints / 100
  const creditsOn = useCredits && usablePoints >= 100
  const payable = creditsOn ? Math.max(total - creditDiscount, 0) : total
  const paidTotal = Math.max(total - appliedDiscount, 0)

  async function handlePay() {
    if (!selected) return
    setProcessing(true)
    setError('')
    setCreditError('')

    const method = METHODS.find(m => m.id === selected)
    const orderIds = allOrderIds?.length ? allOrderIds : [order.id]

    // Redeem Resto-Credits first — never finalize payment if redemption fails
    let discountApplied = 0
    if (creditsOn) {
      try {
        const { error: redeemErr } = await supabase.rpc('redeem_credits', {
          p_points: usablePoints,
          p_order_id: order?.id ?? null,
        })
        if (redeemErr) throw redeemErr
        discountApplied = creditDiscount
        setAppliedDiscount(discountApplied)
      } catch {
        setUseCredits(false)
        setCreditError('Could not apply Resto-Credits. You can pay the full amount instead.')
        setProcessing(false)
        return
      }
    }
    const amountDue = Math.max(total - discountApplied, 0)

    if (method.digital) {
      await new Promise(r => setTimeout(r, 1800))

      const paymentRows = orderIds.map(oid => ({
        order_id: oid,
        user_id: session.user.id,
        amount: amountDue,
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
        amount: amountDue,
        method: selected,
        status: 'pending',
      }))
      const { error: payErr } = await supabase.from('payments').insert(paymentRows)

      if (payErr) { setError(payErr.message); setProcessing(false); return }

      await supabase.from('notifications').insert({
        restaurant_id: restaurantId,
        type: selected === 'cash' ? 'cash_payment_request' : 'reception_payment_request',
        title: selected === 'cash' ? 'Cash Payment Requested' : 'Reception Payment Requested',
        body: `Table requires ${selected === 'cash' ? 'cash collection' : 'reception payment'}. Amount: ${formatPrice(amountDue)}`,
        metadata: JSON.stringify({
          table_id: tableId,
          order_id: order.id,
          amount: amountDue,
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
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(196,154,44,0.12)', border: '1px solid var(--gold)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '1.5rem auto 1rem',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.2rem', fontWeight: 700, marginBottom: 6, color: 'var(--t1)' }}>
              Payment Complete
            </h2>
            <p style={{ color: 'var(--t2)', fontSize: '0.85rem', marginBottom: 4 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{formatPrice(paidTotal)}</span> paid successfully.
            </p>
            {appliedDiscount > 0 && (
              <p style={{ color: 'var(--gold)', fontSize: '0.78rem', marginBottom: 4 }}>
                Resto-Credits saved you {formatPrice(appliedDiscount)}.
              </p>
            )}
            <p style={{ color: 'var(--t3)', fontSize: '0.78rem' }}>Thank you for dining with us!</p>
          </>
        ) : success === 'cash' ? (
          <>
            <div style={{ fontSize: '3rem', margin: '1.5rem 0 1rem' }}>💵</div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.2rem', fontWeight: 700, marginBottom: 6, color: 'var(--t1)' }}>
              Waiter Notified
            </h2>
            <p style={{ color: 'var(--t2)', fontSize: '0.85rem', marginBottom: 4 }}>
              A waiter is coming to collect <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{formatPrice(paidTotal)}</span> in cash.
            </p>
            <p style={{ color: 'var(--t3)', fontSize: '0.78rem' }}>Please have the amount ready.</p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '3rem', margin: '1.5rem 0 1rem' }}>🧾</div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.2rem', fontWeight: 700, marginBottom: 6, color: 'var(--t1)' }}>
              Pay at Reception
            </h2>
            <p style={{ color: 'var(--t2)', fontSize: '0.85rem', marginBottom: 4 }}>
              Please proceed to the reception to pay <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{formatPrice(paidTotal)}</span>.
            </p>
            <p style={{ color: 'var(--t3)', fontSize: '0.78rem' }}>The staff has been notified.</p>
          </>
        )}

        <button className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} onClick={handleDone}>
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
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.15rem', fontWeight: 700, color: 'var(--t1)' }}>
              How would you like to pay?
            </h2>
            <button onClick={onClose} className="icon-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Total display */}
          <div style={{
            textAlign: 'center', padding: '16px', marginBottom: '1.25rem',
            background: 'var(--s3)', borderRadius: 12,
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
              Total Amount
            </div>
            <div style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '2rem', fontWeight: 900, color: 'var(--t1)',
            }}>
              {formatPrice(payable)}
            </div>
            {creditsOn && (
              <div style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '0.72rem', color: 'var(--gold)', marginTop: 4,
              }}>
                {formatPrice(total)} − {formatPrice(creditDiscount)} Resto-Credits
              </div>
            )}
          </div>

          {/* Resto-Credits toggle */}
          {credits >= 100 && total > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 12,
                background: useCredits ? 'rgba(196,154,44,0.08)' : 'var(--s2)',
                border: `1.5px solid ${useCredits ? 'var(--gold)' : 'var(--border)'}`,
                transition: 'all 150ms var(--ease-out)',
              }}>
                <span style={{ fontSize: '1.1rem' }}>🪙</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--t1)' }}>
                    Use Resto-Credits
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--t3)', fontFamily: "'DM Mono', monospace", marginTop: 1 }}>
                    {credits} credits{useCredits ? ` · −${formatPrice(creditDiscount)}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => { setUseCredits(v => !v); setCreditError('') }}
                  style={{
                    width: 44, height: 26, borderRadius: 13, flexShrink: 0,
                    background: useCredits ? 'var(--gold)' : 'var(--s4)',
                    border: 'none', cursor: 'pointer', position: 'relative',
                    transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: 'var(--bg)',
                    position: 'absolute', top: 3, left: useCredits ? 21 : 3,
                    transition: 'left 0.2s',
                  }} />
                </button>
              </div>
              {creditError && (
                <p style={{ color: 'var(--red)', fontSize: '0.74rem', marginTop: 6 }}>{creditError}</p>
              )}
            </div>
          )}

          {/* Payment method label */}
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: '0.6rem' }}>
            Select Payment Method
          </div>

          {/* Methods */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1.25rem' }}>
            {METHODS.map(m => (
              <button
                key={m.id}
                onClick={() => setSelected(m.id)}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 12,
                  border: `1.5px solid ${selected === m.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected === m.id ? 'rgba(139,45,66,0.08)' : 'var(--s2)',
                  display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                  transition: 'all 150ms var(--ease-out)',
                  textAlign: 'left',
                }}
                onPointerDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
                onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
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
                  transition: 'border-color 150ms',
                  flexShrink: 0,
                }}>
                  {selected === m.id && (
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)' }} />
                  )}
                </div>
              </button>
            ))}
          </div>

          {error && (
            <p style={{ color: 'var(--red)', fontSize: '0.78rem', marginBottom: '0.75rem' }}>{error}</p>
          )}

          {/* Note for cash/reception */}
          {(selected === 'cash' || selected === 'reception') && (
            <p style={{ fontSize: '0.72rem', color: 'var(--t3)', textAlign: 'center', marginBottom: 10 }}>
              {selected === 'cash'
                ? 'A waiter will come to your table to collect payment.'
                : 'Please proceed to the reception desk after confirmation.'}
            </p>
          )}

          {/* Pay button */}
          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '13px 0', fontSize: '0.92rem' }}
            onClick={handlePay}
            disabled={!selected || processing}
            onPointerDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
            onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
            onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            {processing ? (
              <><span className="spinner" /> Processing…</>
            ) : selected === 'cash' ? (
              'Notify Waiter'
            ) : selected === 'reception' ? (
              'Confirm'
            ) : (
              `Pay ${formatPrice(payable)}`
            )}
          </button>
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
