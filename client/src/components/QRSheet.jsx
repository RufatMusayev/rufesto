import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'

export default function QRSheet({ onClose }) {
  const { session } = useAuth()
  const { setTable } = useCart()
  const [token,    setToken]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [tableData, setTableData] = useState(null)
  const [error,    setError]    = useState('')
  const [booking,  setBooking]  = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [done,     setDone]     = useState('')

  const [scanning, setScanning]     = useState(true)
  const [camError, setCamError]     = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const scannerRef = useRef(null)

  useEffect(() => {
    if (!scanning || manualMode || tableData) return

    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner

    const config = { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 }
    const onSuccess = (decodedText) => {
      scanner.stop().catch(() => {})
      setScanning(false)
      handleQRResult(decodedText)
    }

    scanner.start({ facingMode: 'environment' }, config, onSuccess, () => {})
      .catch(() => {
        scanner.start({ facingMode: 'user' }, config, onSuccess, () => {})
          .catch(() => {
            setCamError(true)
            setScanning(false)
          })
      })

    return () => {
      scanner.stop().catch(() => {})
    }
  }, [scanning, manualMode, tableData])

  function handleQRResult(text) {
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    const match = text.match(uuidPattern)
    if (match) {
      setToken(match[0])
      lookupTable(match[0])
    } else {
      setError('Invalid QR code. No table token found.')
    }
  }

  async function lookupTable(tokenValue) {
    setError('')
    setLoading(true)

    const { data: table, error: tErr } = await supabase
      .from('tables')
      .select('*, restaurants(id, name, slug, cuisine_type)')
      .eq('qr_code_token', tokenValue.trim())
      .maybeSingle()

    if (tErr || !table) {
      setError('Table not found. Check the token and try again.')
      setLoading(false)
      return
    }

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

  async function handleLookup(e) {
    e.preventDefault()
    await lookupTable(token)
  }

  function handleRetryCamera() {
    setCamError(false)
    setManualMode(false)
    setScanning(true)
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
        reserved_until: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
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
    <div
      className="overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ alignItems: 'flex-end' }}
    >
      <div className="sheet">
        <div className="sheet-handle" />
        <div style={{ padding: '1rem 1.5rem 2.5rem' }}>

          {!tableData ? (
            <>
              {/* Title */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <h2 style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '1.2rem', fontWeight: 700, color: 'var(--t1)',
                }}>
                  Scan Table QR
                </h2>
                <button className="icon-btn" onClick={onClose}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <p style={{ color: 'var(--t3)', fontSize: '0.84rem', marginBottom: '1.25rem' }}>
                Point your camera at the QR code on your table.
              </p>

              {/* Camera viewfinder */}
              {!manualMode && !camError && (
                <div style={{
                  width: '100%', maxWidth: 340, margin: '0 auto 1rem',
                  borderRadius: 16, overflow: 'hidden',
                  background: '#000',
                  border: '2px solid var(--border)',
                  position: 'relative',
                  minHeight: 280,
                }}>
                  <div id="qr-reader" style={{ width: '100%' }} />
                  {scanning && (
                    <div style={{
                      position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
                      borderRadius: 100, padding: '5px 16px',
                      fontSize: '0.72rem', fontWeight: 600, color: '#F5F0E8',
                      whiteSpace: 'nowrap', zIndex: 10,
                    }}>
                      Scanning…
                    </div>
                  )}
                </div>
              )}

              {/* Camera error state */}
              {camError && !manualMode && (
                <div style={{
                  width: '100%', maxWidth: 300, height: 160, margin: '0 auto 1rem',
                  border: '2px dashed var(--border)', borderRadius: 16,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 8,
                  color: 'var(--t3)', fontSize: '0.78rem', textAlign: 'center',
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 1l22 22M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3l2-3h8l2 3h3a2 2 0 012 2v9" />
                  </svg>
                  <span>Camera access denied</span>
                  <button onClick={handleRetryCamera} className="btn btn-ghost"
                    style={{ fontSize: '0.72rem', padding: '4px 12px' }}>
                    Retry Camera
                  </button>
                </div>
              )}

              {/* Manual mode hidden QR reader target */}
              {manualMode && <div id="qr-reader" style={{ display: 'none' }} />}

              {/* Toggle buttons */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: '1rem' }}>
                {!manualMode && (
                  <button className="btn btn-ghost"
                    style={{ fontSize: '0.75rem', padding: '5px 14px' }}
                    onClick={() => { setManualMode(true); setScanning(false) }}>
                    Enter code manually
                  </button>
                )}
                {manualMode && (
                  <button className="btn btn-ghost"
                    style={{ fontSize: '0.75rem', padding: '5px 14px' }}
                    onClick={handleRetryCamera}>
                    Use camera instead
                  </button>
                )}
              </div>

              {/* Manual token input */}
              <form onSubmit={handleLookup}>
                <input
                  className="input"
                  placeholder="Paste table token (UUID)"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  style={{ marginBottom: '0.75rem' }}
                  required
                />
                {error && <p style={{ color: 'var(--red)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
                <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading || !token.trim()}>
                  {loading ? <><span className="spinner" /> Looking up…</> : 'Find Table'}
                </button>
              </form>
              <button className="btn btn-ghost" style={{ width: '100%', marginTop: '0.5rem' }} onClick={onClose}>
                Cancel
              </button>
            </>
          ) : done === 'seated' ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'var(--sage-bg)', border: '1px solid var(--sage)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.2rem', fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>
                You're seated!
              </h2>
              <p style={{ color: 'var(--t2)', fontSize: '0.85rem' }}>
                Add items to your order from the menu.
              </p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: '1.15rem', color: 'var(--t1)' }}>
                  {tableData.restaurant.name}
                </div>
                <div style={{ color: 'var(--t3)', fontSize: '0.84rem', marginTop: 3 }}>
                  {tableData.restaurant.cuisine_type} · Table {tableData.table.table_number}
                </div>
                <div style={{ marginTop: '0.6rem' }}>
                  <StateChip state={state} />
                </div>
              </div>

              {error && <p style={{ color: 'var(--red)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}

              {state === 'free' && (
                <>
                  <p style={{ color: 'var(--t2)', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                    This table is available. Book it now for an instant walk-in.
                  </p>
                  <button className="btn btn-primary" style={{ width: '100%' }} disabled={booking} onClick={handleBook}>
                    {booking ? <><span className="spinner" /> Booking…</> : 'Book This Table'}
                  </button>
                </>
              )}

              {state === 'reserved' && isMyBooking && (
                <>
                  <p style={{ color: 'var(--sage)', fontSize: '0.88rem', fontWeight: 700, marginBottom: '1rem' }}>
                    ✓ This is your table
                  </p>
                  <button className="btn btn-primary" style={{ width: '100%' }} disabled={confirming} onClick={handleConfirmArrival}>
                    {confirming ? <><span className="spinner" /> Confirming…</> : 'Confirm Arrival & Start Order'}
                  </button>
                </>
              )}

              {state === 'reserved' && !isMyBooking && (
                <p style={{ color: 'var(--t2)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                  This table is reserved by someone else. Please ask staff for assistance.
                </p>
              )}

              {(state === 'occupied' || state === 'ordering' || state === 'awaiting_payment') && (
                <p style={{ color: 'var(--t2)', fontSize: '0.85rem', lineHeight: 1.5 }}>
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
    free:             { label: 'Available',  color: 'var(--sage)',   bg: 'var(--sage-bg)'             },
    reserved:         { label: 'Reserved',   color: 'var(--accent)', bg: 'rgba(245,158,11,0.1)'       },
    occupied:         { label: 'Occupied',   color: 'var(--red)',    bg: 'rgba(239,68,68,0.12)'       },
    ordering:         { label: 'Occupied',   color: 'var(--red)',    bg: 'rgba(239,68,68,0.12)'       },
    awaiting_payment: { label: 'Occupied',   color: 'var(--red)',    bg: 'rgba(239,68,68,0.12)'       },
    cleared:          { label: 'Available',  color: 'var(--sage)',   bg: 'var(--sage-bg)'             },
  }
  const s = MAP[state] || { label: state, color: 'var(--t2)', bg: 'var(--s3)' }
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 100,
      fontSize: '0.72rem', fontWeight: 700, background: s.bg, color: s.color,
      border: `1px solid ${s.color}22`,
    }}>
      {s.label}
    </span>
  )
}
