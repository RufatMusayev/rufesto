import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'

export default function QRSheet({ onClose }) {
  const { session } = useAuth()
  const { setTable } = useCart()
  const [token,    setToken]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [tableData, setTableData] = useState(null) // { table, restaurant, userBooking }
  const [error,    setError]    = useState('')
  const [booking,  setBooking]  = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [done,     setDone]     = useState('')

  async function handleLookup(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: table, error: tErr } = await supabase
      .from('tables')
      .select('*, restaurants(id, name, slug, cuisine_type)')
      .eq('qr_code_token', token.trim())
      .maybeSingle()

    if (tErr || !table) {
      setError('Table not found. Check the token and try again.')
      setLoading(false)
      return
    }

    // Check if current user has a booking for this table
    const { data: userBooking } = await supabase
      .from('bookings')
      .select('*')
      .eq('table_id', table.id)
      .eq('user_id', session.user.id)
      .in('status', ['pending', 'confirmed'])
      .maybeSingle()

    setTableData({ table, restaurant: table.restaurants, userBooking })
    setLoading(false)
  }

  async function handleBook() {
    setBooking(true)
    setError('')
    const { data, error: bErr } = await supabase
      .from('bookings')
      .insert({
        restaurant_id: tableData.restaurant.id,
        table_id:      tableData.table.id,
        user_id:       session.user.id,
        party_size:    1,
        reserved_from: new Date().toISOString(),
        reserved_to:   new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        status:        'confirmed',
        booking_type:  'walk_in',
      })
      .select()
      .single()
    setBooking(false)
    if (bErr) { setError(bErr.message); return }
    setTableData(prev => ({ ...prev, userBooking: data, table: { ...prev.table, state: 'reserved' } }))
  }

  async function handleConfirmArrival() {
    setConfirming(true)
    setError('')

    const { error: bErr } = await supabase
      .from('bookings')
      .update({ status: 'seated' })
      .eq('id', tableData.userBooking.id)

    const { error: tErr } = await supabase
      .from('tables')
      .update({ state: 'occupied' })
      .eq('id', tableData.table.id)

    setConfirming(false)
    if (bErr || tErr) { setError((bErr || tErr).message); return }

    setTable(tableData.table.id, tableData.restaurant.id, tableData.userBooking.id)
    setDone('seated')
    setTimeout(onClose, 1200)
  }

  const state = tableData?.table?.state
  const isMyBooking = !!tableData?.userBooking

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}
      style={{ alignItems: 'flex-end' }}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div style={{ padding: '1rem 1.5rem 2.5rem' }}>

          {!tableData ? (
            <>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 900, marginBottom: '0.4rem' }}>Scan Table QR</h2>
              <p style={{ color: 'var(--t2)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                Enter the token from your table's QR code.
              </p>

              {/* Simulated QR viewfinder */}
              <div style={{
                width: 160, height: 160, margin: '0 auto 1.5rem',
                border: '3px dashed var(--border)', borderRadius: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--t3)', fontSize: '0.78rem', textAlign: 'center', lineHeight: 1.4,
              }}>
                📷<br />Camera<br />coming soon
              </div>

              <form onSubmit={handleLookup}>
                <input className="input" placeholder="Paste table token (UUID)"
                  value={token} onChange={e => setToken(e.target.value)}
                  style={{ marginBottom: '0.75rem' }} required />
                {error && <p style={{ color: 'var(--red)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
                <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading || !token.trim()}>
                  {loading ? <><span className="spinner" />Looking up…</> : 'Find Table'}
                </button>
              </form>
              <button className="btn btn-ghost" style={{ width: '100%', marginTop: '0.5rem' }} onClick={onClose}>Cancel</button>
            </>
          ) : done === 'seated' ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
              <h2 style={{ fontWeight: 900 }}>You're seated!</h2>
              <p style={{ color: 'var(--t2)', fontSize: '0.85rem', marginTop: '0.4rem' }}>
                Add items to your order from the menu.
              </p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontWeight: 900, fontSize: '1.15rem' }}>{tableData.restaurant.name}</div>
                <div style={{ color: 'var(--t2)', fontSize: '0.85rem', marginTop: 2 }}>
                  {tableData.restaurant.cuisine_type} · Table {tableData.table.table_number}
                </div>
                <div style={{ marginTop: '0.5rem' }}>
                  <StateChip state={state} />
                </div>
              </div>

              {error && <p style={{ color: 'var(--red)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}

              {state === 'free' && (
                <>
                  <p style={{ color: 'var(--t2)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                    This table is available. Book it now for an instant walk-in.
                  </p>
                  <button className="btn btn-primary" style={{ width: '100%' }} disabled={booking} onClick={handleBook}>
                    {booking ? <><span className="spinner" />Booking…</> : 'Book This Table'}
                  </button>
                </>
              )}

              {(state === 'reserved') && isMyBooking && (
                <>
                  <p style={{ color: 'var(--green)', fontSize: '0.88rem', fontWeight: 700, marginBottom: '1rem' }}>
                    ✓ This is your table
                  </p>
                  <button className="btn btn-primary" style={{ width: '100%' }} disabled={confirming} onClick={handleConfirmArrival}>
                    {confirming ? <><span className="spinner" />Confirming…</> : 'Confirm Arrival & Start Order'}
                  </button>
                </>
              )}

              {(state === 'reserved') && !isMyBooking && (
                <p style={{ color: 'var(--t2)', fontSize: '0.85rem' }}>
                  This table is reserved by someone else. Please ask staff for assistance.
                </p>
              )}

              {(state === 'occupied' || state === 'ordering' || state === 'awaiting_payment') && (
                <p style={{ color: 'var(--t2)', fontSize: '0.85rem' }}>
                  This table is currently occupied.
                </p>
              )}

              <button className="btn btn-ghost" style={{ width: '100%', marginTop: '0.75rem' }} onClick={onClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StateChip({ state }) {
  const MAP = {
    free:             { label: 'Available',  color: 'var(--green)', bg: 'rgba(34,197,94,0.12)' },
    reserved:         { label: 'Reserved',   color: 'var(--accent)', bg: 'rgba(245,158,11,0.1)' },
    occupied:         { label: 'Occupied',   color: 'var(--red)',   bg: 'rgba(239,68,68,0.12)' },
    ordering:         { label: 'Occupied',   color: 'var(--red)',   bg: 'rgba(239,68,68,0.12)' },
    awaiting_payment: { label: 'Occupied',   color: 'var(--red)',   bg: 'rgba(239,68,68,0.12)' },
    cleared:          { label: 'Available',  color: 'var(--green)', bg: 'rgba(34,197,94,0.12)' },
  }
  const s = MAP[state] || { label: state, color: 'var(--t2)', bg: 'var(--s3)' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 100,
      fontSize: '0.72rem', fontWeight: 700, background: s.bg, color: s.color,
    }}>{s.label}</span>
  )
}
