import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { BOOKING_MINUTES, addDays, bakuDateString, bakuToInstant, bookableSlots, checkSlot } from '../lib/bookingSlots'
import AuthModal from './AuthModal'

export default function BookingModal({ restaurant, onClose, preselectedTable = null }) {
  const { t } = useTranslation(['booking', 'common'])
  const { session } = useAuth()
  const [step,    setStep]    = useState(session ? 'form' : 'auth')
  const [date,    setDate]    = useState('')
  const [time,    setTime]    = useState('')
  const [party,   setParty]   = useState(preselectedTable ? Math.min(2, preselectedTable.capacity) : 2)
  const [note,    setNote]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [done,    setDone]    = useState(false)
  // Status the database actually gave the new booking ('pending' until the restaurant confirms).
  const [resultStatus, setResultStatus] = useState(null)
  // Opening hours normally arrive embedded in the restaurant (RestaurantPage loads them);
  // fetch them ourselves when they didn't, so the form never has to guess.
  const [hours,      setHours]      = useState(Array.isArray(restaurant.operating_hours) ? restaurant.operating_hours : null)
  const [hoursError, setHoursError] = useState(false)
  const [closures,   setClosures]   = useState([])

  // "Today" and the booking window are Baku dates, not the visitor's browser dates.
  const today   = bakuDateString()
  const maxDate = addDays(today, 30)

  const maxParty = preselectedTable ? preselectedTable.capacity : 12

  useEffect(() => {
    if (hours) return
    let cancelled = false
    supabase
      .from('operating_hours')
      .select('day_of_week, open_time, close_time, is_closed')
      .eq('restaurant_id', restaurant.id)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) setHoursError(true)
        else setHours(data || [])
      })
    return () => { cancelled = true }
  }, [restaurant.id, hours])

  // Special closures (holidays etc.) inside the booking window. Not always readable by
  // guests; if the read comes back empty or fails, the database still enforces them.
  useEffect(() => {
    let cancelled = false
    supabase
      .from('special_closures')
      .select('closed_date, reason')
      .eq('restaurant_id', restaurant.id)
      .gte('closed_date', today)
      .lte('closed_date', maxDate)
      .then(({ data, error: err }) => {
        if (!cancelled && !err) setClosures(data || [])
      })
    return () => { cancelled = true }
  }, [restaurant.id, today, maxDate])

  const day = useMemo(
    () => (hours && date ? bookableSlots(hours, closures, date) : null),
    [hours, closures, date],
  )

  // Drop a chosen time that the newly picked date doesn't offer.
  useEffect(() => {
    if (time && day && !day.slots.includes(time)) setTime('')
  }, [day, time])

  function closedMessage(info) {
    switch (info.status ?? info.code) {
      case 'closedDate':
        return info.reason ? t('booking:closedOnDateReason', { reason: info.reason }) : t('booking:closedOnDate')
      case 'closedDay':    return t('booking:closedOnDay')
      case 'noneLeft':     return t('booking:noSlotsLeft')
      case 'past':         return t('booking:errPastTime')
      case 'outsideHours': return t('booking:errOutsideHours', { open: info.open, close: info.close })
      default:             return ''
    }
  }

  // Translate the database's booking errors (validate_booking_time, the overlap constraint) so the
  // guest never sees raw English exception text.
  function bookingErrorMessage(err) {
    const msg = err?.message || ''
    if (err?.code === '23P01') return t('booking:errNoTables')   // exclusion constraint: slot taken
    if (/closed on that day/i.test(msg)) return t('booking:closedOnDay')
    if (/closed on/i.test(msg)) return t('booking:closedOnDate')
    if (/outside operating hours/i.test(msg)) {
      return t('booking:errOutsideHours', { open: day?.open ?? '', close: day?.close ?? '' })
    }
    return t('booking:errBookingFailed')
  }

  async function handleBook(e) {
    e.preventDefault()
    setError('')

    if (!hours) { setError(t('booking:errHoursUnavailable')); return }
    if (date < today || date > maxDate) { setError(t('booking:errDateRange')); return }
    const problem = checkSlot(hours, closures, date, time)
    if (problem) { setError(closedMessage(problem)); return }

    setLoading(true)

    const from  = bakuToInstant(date, time)
    const until = new Date(from.getTime() + BOOKING_MINUTES * 60000)

    let tableId
    if (preselectedTable) {
      if (party > preselectedTable.capacity) {
        setError(t('booking:errTableCapacity', { number: preselectedTable.table_number, capacity: preselectedTable.capacity }))
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
        setError(t('booking:errNoTables'))
        setLoading(false)
        return
      }
      tableId = tables[0].id
    }

    const { data: booking, error: bErr } = await supabase.from('bookings').insert({
      restaurant_id:    restaurant.id,
      user_id:          session.user.id,
      table_id:         tableId,
      reserved_from:    from.toISOString(),
      reserved_until:   until.toISOString(),
      party_size:       party,
      status:           'pending',
      special_requests: note || null,
      source:           'app',
    }).select('status').single()

    setLoading(false)
    if (bErr) { setError(bookingErrorMessage(bErr)); return }
    setResultStatus(booking?.status ?? null)
    setDone(true)
  }

  if (done) {
    // Only claim "confirmed" when the row really is confirmed; anything else (including an
    // unreadable status) is a request the restaurant still has to accept.
    const confirmed = resultStatus === 'confirmed'
    return (
      <div className="overlay center" onClick={onClose}>
        <div className="modal modal-narrow" onClick={e => e.stopPropagation()}>
          <div className="state-panel">
            <div className={`state-icon ${confirmed ? 'state-icon-sage' : ''}`}>
              {confirmed ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
                  <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" />
                </svg>
              )}
            </div>
            <h2 className="state-title">
              {confirmed ? t('booking:bookingConfirmed') : t('booking:bookingRequested')}
            </h2>
            <p className="state-body">
              {restaurant.name}<br />
              <span className="state-meta">{t('booking:bookingSummary', { date, time, count: party })}</span>
            </p>
            {!confirmed && <p className="state-note">{t('booking:bookingRequestedHint')}</p>}
            <button className="btn btn-primary state-done" onClick={onClose}>
              {t('common:done')}
            </button>
          </div>
        </div>
      </div>
    )
  }

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
              {t('booking:reserveTable')}
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
                {t('booking:tableBadge', { number: preselectedTable.table_number, section: preselectedTable.sections?.name || 'Floor', capacity: preselectedTable.capacity })}
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
              {t('booking:guests')}
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
                  {t('common:guest', { count: party })}
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
              {t('booking:date')}
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
              {t('booking:time')}
            </label>
            {!date ? (
              <p className="slot-hint">{t('booking:pickDateFirst')}</p>
            ) : hoursError ? (
              <p className="slot-hint slot-hint-warn">{t('booking:errHoursUnavailable')}</p>
            ) : !day ? (
              <div className="skeleton slot-skeleton" />
            ) : day.status !== 'ok' ? (
              <p className="slot-hint slot-hint-warn">{closedMessage(day)}</p>
            ) : (
              <>
                <p className="slot-hint">{t('booking:openHours', { open: day.open, close: day.close })}</p>
                <div className="slot-grid">
                  {day.slots.map(slot => (
                    <button
                      key={slot}
                      type="button"
                      className={`slot-btn ${time === slot ? 'active' : ''}`}
                      onClick={() => setTime(slot)}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Special requests */}
          <div style={{ marginBottom: 18 }}>
            <label style={{
              fontSize: '0.72rem', fontWeight: 700, color: 'var(--t3)',
              display: 'block', marginBottom: 8,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              {t('booking:specialRequests')}
            </label>
            <textarea
              className="input"
              placeholder={t('booking:specialRequestsPlaceholder')}
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
                {t('booking:booking')}
              </span>
            ) : t('booking:requestBooking')}
          </button>
        </form>
      </div>
    </div>
  )
}
