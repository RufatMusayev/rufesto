import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AuthModal from './AuthModal'

export default function BookingModal({ restaurant, onClose, preselectedTable = null }) {
  const { session } = useAuth()
  const [step,    setStep]    = useState(session ? 'form' : 'auth')
  const [date,    setDate]    = useState('')
  const [time,    setTime]    = useState('')
  const [party,   setParty]   = useState(preselectedTable ? Math.min(2, preselectedTable.capacity) : 2)
  const [note,    setNote]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [done,    setDone]    = useState(false)

  const today   = new Date().toISOString().split('T')[0]
  const maxDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  const TIME_SLOTS = ['12:00','12:30','13:00','13:30','14:00','14:30',
    '18:00','18:30','19:00','19:30','20:00','20:30','21:00','21:30','22:00']

  const maxParty = preselectedTable ? preselectedTable.capacity : 12

  async function handleBook(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const from  = new Date(`${date}T${time}`)
    const until = new Date(from.getTime() + 90 * 60000)

    let tableId
    if (preselectedTable) {
      if (party > preselectedTable.capacity) {
        setError(`Table ${preselectedTable.table_number} seats up to ${preselectedTable.capacity} guests.`)
        setLoading(false)
        return
      }
      tableId = preselectedTable.id
    } else {
      const { data: tables, error: tErr } = await supabase
        .from('tables')
        .select('id, table_number, capacity, state')
        .eq('restaurant_id', restaurant.id)
        .eq('is_active', true)
        .gte('capacity', party)
        .eq('state', 'free')
        .order('capacity')
        .limit(1)

      if (tErr || !tables?.length) {
        setError('No available tables for this party size and time.')
        setLoading(false)
        return
      }
      tableId = tables[0].id
    }

    const { error: bErr } = await supabase.from('bookings').insert({
      restaurant_id:    restaurant.id,
      user_id:          session.user.id,
      table_id:         tableId,
      reserved_from:    from.toISOString(),
      reserved_until:   until.toISOString(),
      party_size:       party,
      status:           'pending',
      special_requests: note || null,
      source:           'app',
    })

    setLoading(false)
    if (bErr) { setError(bErr.message); return }
    setDone(true)
  }

  if (done) return (
    <div className="overlay center" onClick={onClose}>
      <div
        className="modal"
        style={{ padding: 0, maxWidth: 360 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          padding: '40px 28px 32px',
          textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
        }}>
          {/* Success icon */}
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'var(--sage-bg)',
            border: '2px solid var(--sage)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
          }}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" style={{ width: 28, height: 28, stroke: 'var(--sage)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 700, fontSize: '1.3rem',
            color: 'var(--t1)', marginBottom: 8, lineHeight: 1.2,
          }}>
            Booking Confirmed
          </h2>
          <p style={{ color: 'var(--t2)', fontSize: '0.84rem', lineHeight: 1.55, marginBottom: 24 }}>
            {restaurant.name}<br />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.78rem', color: 'var(--t3)' }}>
              {date} at {time} · {party} {party === 1 ? 'guest' : 'guests'}
            </span>
          </p>
          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '11px 0', borderRadius: 12, fontWeight: 700 }}
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )

  if (step === 'auth') return (
    <AuthModal onClose={onClose} onSuccess={() => setStep('form')} />
  )

  return (
    <div className="overlay center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ padding: 0, maxWidth: 400, width: '92vw' }}>

        {/* Modal header */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '1.2rem', fontWeight: 700, color: 'var(--t1)',
              lineHeight: 1.2, marginBottom: 4,
            }}>
              Reserve a Table
            </h2>
            <p style={{ fontSize: '0.76rem', color: 'var(--t3)', fontWeight: 500 }}>
              {restaurant.name}
            </p>
            {preselectedTable && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                marginTop: 7, padding: '3px 10px', borderRadius: 20,
                background: 'var(--gold-bg, rgba(196,154,44,0.12))',
                border: '1px solid var(--gold)',
                fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)',
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 11, height: 11 }}>
                  <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" />
                </svg>
                Table {preselectedTable.table_number} · {preselectedTable.sections?.name || 'Floor'} · up to {preselectedTable.capacity}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="icon-btn"
            style={{ width: 30, height: 30, color: 'var(--t2)', marginTop: 2 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ width: 16, height: 16 }}>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleBook} style={{ padding: '18px 20px 20px' }}>

          {/* Party size */}
          <div style={{ marginBottom: 18 }}>
            <label style={{
              fontSize: '0.72rem', fontWeight: 700, color: 'var(--t3)',
              display: 'block', marginBottom: 10,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              Guests
            </label>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--s2)', borderRadius: 12,
              border: '1px solid var(--border)',
              padding: '10px 16px',
            }}>
              <button
                type="button"
                onClick={() => setParty(p => Math.max(1, p - 1))}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: party <= 1 ? 'var(--s3)' : 'var(--s4)',
                  border: '1px solid var(--border)',
                  color: party <= 1 ? 'var(--t4)' : 'var(--t1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: party <= 1 ? 'default' : 'pointer',
                  fontSize: '1.1rem', fontWeight: 700, flexShrink: 0,
                  transition: 'all 150ms var(--ease-out)',
                }}
              >
                −
              </button>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <span style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '1.3rem', fontWeight: 700, color: 'var(--t1)',
                }}>
                  {party}
                </span>
                <div style={{ fontSize: '0.65rem', color: 'var(--t3)', marginTop: 1 }}>
                  {party === 1 ? 'guest' : 'guests'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setParty(p => Math.min(maxParty, p + 1))}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: party >= maxParty ? 'var(--s3)' : 'var(--s4)',
                  border: '1px solid var(--border)',
                  color: party >= maxParty ? 'var(--t4)' : 'var(--t1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: party >= maxParty ? 'default' : 'pointer',
                  fontSize: '1.1rem', fontWeight: 700, flexShrink: 0,
                  transition: 'all 150ms var(--ease-out)',
                }}
              >
                +
              </button>
            </div>
          </div>

          {/* Date */}
          <div style={{ marginBottom: 18 }}>
            <label style={{
              fontSize: '0.72rem', fontWeight: 700, color: 'var(--t3)',
              display: 'block', marginBottom: 8,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              Date
            </label>
            <input
              type="date"
              className="input"
              min={today}
              max={maxDate}
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              style={{ borderRadius: 10 }}
            />
          </div>

          {/* Time slots */}
          <div style={{ marginBottom: 18 }}>
            <label style={{
              fontSize: '0.72rem', fontWeight: 700, color: 'var(--t3)',
              display: 'block', marginBottom: 8,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              Time
            </label>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6,
            }}>
              {TIME_SLOTS.map(t => {
                const active = time === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTime(t)}
                    style={{
                      padding: '7px 0', borderRadius: 9,
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      background: active ? 'var(--accent)' : 'var(--s2)',
                      color: active ? '#F5F0E8' : 'var(--t2)',
                      fontFamily: "'DM Mono', monospace",
                      fontSize: '0.72rem', fontWeight: active ? 700 : 500,
                      cursor: 'pointer', textAlign: 'center',
                      transition: 'all 150ms var(--ease-out)',
                    }}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Special requests */}
          <div style={{ marginBottom: 18 }}>
            <label style={{
              fontSize: '0.72rem', fontWeight: 700, color: 'var(--t3)',
              display: 'block', marginBottom: 8,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              Special Requests
              <span style={{ textTransform: 'none', fontWeight: 400, marginLeft: 5, color: 'var(--t4)' }}>
                (optional)
              </span>
            </label>
            <textarea
              className="input"
              placeholder="Allergies, special occasions, seating preferences..."
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
              style={{ resize: 'none', borderRadius: 10 }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: 14, padding: '9px 12px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 9,
            }}>
              <p style={{ color: 'var(--red)', fontSize: '0.78rem', lineHeight: 1.4 }}>
                {error}
              </p>
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{
              width: '100%', padding: '11px 0',
              fontSize: '0.88rem', fontWeight: 700, borderRadius: 12,
            }}
            disabled={loading || !date || !time}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span className="spinner" />
                Booking...
              </span>
            ) : 'Confirm Booking'}
          </button>
        </form>
      </div>
    </div>
  )
}
