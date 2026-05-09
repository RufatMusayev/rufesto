import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AuthModal from './AuthModal'

export default function BookingModal({ restaurant, onClose }) {
  const { session } = useAuth()
  const [step,    setStep]    = useState(session ? 'form' : 'auth')
  const [date,    setDate]    = useState('')
  const [time,    setTime]    = useState('')
  const [party,   setParty]   = useState(2)
  const [note,    setNote]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [done,    setDone]    = useState(false)

  const today   = new Date().toISOString().split('T')[0]
  const maxDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  const TIME_SLOTS = ['12:00','12:30','13:00','13:30','14:00','14:30',
    '18:00','18:30','19:00','19:30','20:00','20:30','21:00','21:30','22:00']

  async function handleBook(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const from  = new Date(`${date}T${time}`)
    const until = new Date(from.getTime() + 90 * 60000)

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

    const { error: bErr } = await supabase.from('bookings').insert({
      restaurant_id:    restaurant.id,
      user_id:          session.user.id,
      table_id:         tables[0].id,
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
      <div className="modal" style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', margin: '0.5rem 0 0.75rem' }}>✓</div>
        <h2 style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: '0.4rem' }}>Booking Confirmed</h2>
        <p style={{ color: 'var(--t2)', fontSize: '0.88rem', marginBottom: '1.5rem' }}>
          {restaurant.name} · {date} at {time} · {party} guests
        </p>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>Done</button>
      </div>
    </div>
  )

  if (step === 'auth') return (
    <AuthModal onClose={onClose} onSuccess={() => setStep('form')} />
  )

  return (
    <div className="overlay center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ padding: '1.25rem 1.25rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Reserve a Table</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--t2)' }}>{restaurant.name}</p>
          </div>
          <button onClick={onClose} className="icon-btn">✕</button>
        </div>

        <form onSubmit={handleBook} style={{ padding: '1rem 1.25rem 1.5rem' }}>
          {/* Party size */}
          <label style={{ fontSize: '0.78rem', color: 'var(--t2)', display: 'block', marginBottom: '0.35rem' }}>Guests</label>
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1rem' }}>
            {[1,2,3,4,5,6,8].map(n => (
              <button key={n} type="button" onClick={() => setParty(n)}
                className={`chip${party === n ? ' active' : ''}`}
                style={{ flex: 1, justifyContent: 'center', padding: '0.5rem 0' }}>
                {n}
              </button>
            ))}
          </div>

          {/* Date */}
          <label style={{ fontSize: '0.78rem', color: 'var(--t2)', display: 'block', marginBottom: '0.35rem' }}>Date</label>
          <input type="date" className="input" style={{ marginBottom: '1rem' }}
            min={today} max={maxDate} value={date} onChange={e => setDate(e.target.value)} required />

          {/* Time */}
          <label style={{ fontSize: '0.78rem', color: 'var(--t2)', display: 'block', marginBottom: '0.35rem' }}>Time</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '0.3rem', marginBottom: '1rem' }}>
            {TIME_SLOTS.map(t => (
              <button key={t} type="button" onClick={() => setTime(t)}
                className={`chip${time === t ? ' active' : ''}`}
                style={{ justifyContent: 'center', padding: '0.4rem 0' }}>
                {t}
              </button>
            ))}
          </div>

          {/* Note */}
          <textarea className="input" placeholder="Special requests (optional)" rows={2}
            value={note} onChange={e => setNote(e.target.value)}
            style={{ resize: 'none', marginBottom: '1rem' }} />

          {error && <p style={{ color: 'var(--red)', fontSize: '0.78rem', marginBottom: '0.65rem' }}>{error}</p>}

          <button className="btn btn-primary" style={{ width: '100%' }}
            disabled={loading || !date || !time}>
            {loading ? <><span className="spinner" />Booking…</> : 'Confirm Booking'}
          </button>
        </form>
      </div>
    </div>
  )
}
