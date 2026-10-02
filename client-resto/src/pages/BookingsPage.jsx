import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { BOOKING_STATUS_STYLE } from '@shared/constants'
import { bakuDayLabel, bakuTimeLabel, bakuTodayStartISO } from '../lib/time'
import { debounce } from '../lib/debounce'
import { subscribeResync } from '../lib/realtime'
import { friendlyError, writeError } from '../lib/errors'
import { roleCan } from '../lib/roles'
import ActionBanner from '../components/ActionBanner'
import { GroupBookingPanel } from '../features/v2/mounts'

// Real `booking_status` values. `no_show` is set by the mark_no_shows() job, so
// its chip only shows while a booking has it (or the chip is selected).
const STATUSES = ['all', 'pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show']
const OPTIONAL_STATUSES = ['no_show']

const STATUS_LABEL_KEYS = {
  pending: 'bkPending', confirmed: 'bkConfirmed', seated: 'bkSeated',
  completed: 'bkCompleted', cancelled: 'bkCancelled', no_show: 'bkNoShow',
}

const STATUS_STYLE = {
  ...BOOKING_STATUS_STYLE,
  no_show: { bg: 'rgba(239,68,68,0.08)', color: 'var(--red)' },
}

// Rows per page. "Load more" raises the limit by this much; one extra row is asked for to know whether more exist.
const PAGE_SIZE = 50

export default function BookingsPage() {
  const { restaurantId, staffRow } = useAuth()
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  // A guest's phone number is for the front of house; the e-mail address is never loaded or shown (docs/CLIENT_RESTO_DASHBOARD.md 1.10).
  const showPhone = roleCan(staffRow?.role, 'guestPhone')
  const [bookings, setBookings] = useState([])
  const [filter,   setFilter]   = useState('all')
  const [view,     setView]     = useState('upcoming')   // 'upcoming' = from the start of today (Baku) on, soonest first; 'past' = before today, latest first
  const [limit,    setLimit]    = useState(PAGE_SIZE)
  const [hasMore,  setHasMore]  = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [actionError, setActionError] = useState('')

  // The realtime handler is created once, so what load() needs to know now is read from refs.
  const queryRef = useRef({ view, limit, showPhone })
  queryRef.current = { view, limit, showPhone }
  const requestSeq = useRef(0)

  useEffect(() => {
    if (!restaurantId) return
    // Guests booking from the app, the cancel/no-show jobs and other staff all
    // write `bookings`; debounced so a burst is one reload.
    const debouncedLoad = debounce(load, 400)
    const channel = supabase
      .channel(`dash-bookings-${restaurantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bookings',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, debouncedLoad)

    const stop = subscribeResync(channel, debouncedLoad)
    return () => { debouncedLoad.cancel(); stop() }
  }, [restaurantId])

  // A different view or a bigger page is a fresh query.
  useEffect(() => {
    if (restaurantId) load()
  }, [restaurantId, view, limit])

  async function load() {
    const q = queryRef.current
    const seq = ++requestSeq.current
    const upcoming = q.view === 'upcoming'
    const today = bakuTodayStartISO()
    let query = supabase
      .from('bookings')
      .select(`*, users!bookings_user_id_fkey(name${q.showPhone ? ', phone' : ''}), tables(table_number)`)
      .eq('restaurant_id', restaurantId)
    query = upcoming ? query.gte('reserved_from', today) : query.lt('reserved_from', today)
    const { data } = await query
      .order('reserved_from', { ascending: upcoming })
      .limit(q.limit + 1)
    if (seq !== requestSeq.current) return   // a newer request (another view / page size) has taken over
    const rows = data || []
    setHasMore(rows.length > q.limit)
    setBookings(rows.slice(0, q.limit))
    setLoading(false)
  }

  function switchView(next) {
    if (next === view) return
    setLoading(true)
    setBookings([])
    setHasMore(false)
    setLimit(PAGE_SIZE)
    setView(next)
  }

  async function updateStatus(id, status) {
    const prevStatus = bookings.find(b => b.id === id)?.status
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b))
    const error = writeError(await supabase.from('bookings').update({ status }).eq('id', id).select('id'))
    if (error) {
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: prevStatus } : b))
      setActionError(friendlyError(error, t))
    }
  }

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)
  const more = hasMore ? '+' : ''

  return (
    <div style={{ padding: '1.25rem' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', paddingBottom:'1rem', borderBottom:'1px solid var(--border)' }}>
        <h1 className="page-title">{t('dashboard:bookingsTitle')}</h1>
        <span style={{ fontSize:'0.78rem', color:'var(--t3)' }}>
          {t('dashboard:bookingCount', { count: filtered.length })}
        </span>
      </div>

      {actionError && <ActionBanner message={actionError} onClose={() => setActionError('')} />}

      <div className="no-scrollbar bk-views" role="group" aria-label={t('dashboard:bookingsTitle')}>
        {['upcoming', 'past'].map(v => (
          <button key={v} type="button" className={`chip${view === v ? ' active' : ''}`}
            aria-pressed={view === v} onClick={() => switchView(v)}>
            {t(v === 'upcoming' ? 'dashboard:bookingsUpcoming' : 'dashboard:bookingsPast')}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', marginBottom: '1.25rem' }} className="no-scrollbar">
        {STATUSES.map(s => {
          const cnt = s === 'all' ? bookings.length : bookings.filter(b => b.status === s).length
          if (OPTIONAL_STATUSES.includes(s) && cnt === 0 && filter !== s) return null
          return (
            <button key={s} className={`chip${filter === s ? ' active' : ''}`}
              onClick={() => setFilter(s)}>
              {s === 'all'
                ? t('dashboard:bookingFilterAll', { count: cnt, more })
                : `${t(`dashboard:${STATUS_LABEL_KEYS[s]}`)} (${cnt}${more})`}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ color: 'var(--t3)' }}>{t('dashboard:loadingBookings')}</div>
      ) : filtered.length === 0 && !hasMore ? (
        <div className="empty"><div className="empty-icon">📋</div>{t('dashboard:noBookings')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(b => {
            const sc = STATUS_STYLE[b.status] || STATUS_STYLE.pending
            // The restaurant's clock (Baku), not the viewer's: a 14:00 slot reads 14:00 on a phone set to another zone.
            const guestPhone = showPhone ? b.users?.phone : null
            return (
              <div key={b.id} style={{
                background:'var(--s2)', borderRadius:14,
                border:'1px solid var(--border)', overflow:'hidden',
                transition:'transform 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.transform='translateY(-1px)'}
                onMouseLeave={e => e.currentTarget.style.transform='translateY(0)'}
              >
                {/* Status bar */}
                <div style={{ height:2, background: sc.color, opacity:0.6 }} />

                <div style={{ padding:'0.85rem 1rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.5rem' }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:'0.92rem' }}>
                        {b.users?.name || t('dashboard:unknownGuest')}
                      </div>
                      {guestPhone && (
                        <div style={{ fontSize:'0.72rem', color:'var(--t2)', marginTop:2 }}>{guestPhone}</div>
                      )}
                    </div>
                    <span style={{
                      fontSize:'0.62rem', fontWeight:700, padding:'3px 9px', borderRadius:100,
                      background: sc.bg, color: sc.color,
                      textTransform:'uppercase', letterSpacing:0.3,
                    }}>{STATUS_LABEL_KEYS[b.status] ? t(`dashboard:${STATUS_LABEL_KEYS[b.status]}`) : b.status}</span>
                  </div>

                  <div style={{ display:'flex', gap:'0.65rem', fontSize:'0.8rem', color:'var(--t2)', marginBottom:'0.5rem', flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontWeight:600, color:'var(--t1)' }}>
                      {bakuDayLabel(b.reserved_from, i18n.language)}
                    </span>
                    <span>{t('dashboard:atTime', { time: bakuTimeLabel(b.reserved_from, i18n.language) })}</span>
                    <span>·</span>
                    <span>{t('dashboard:bookingGuests', { count: b.party_size })}</span>
                    {b.tables?.table_number && <span>· {t('common:tableLabel', { number: b.tables.table_number })}</span>}
                  </div>

                  {b.special_requests && (
                    <p style={{ fontSize:'0.78rem', color:'var(--accent)', marginBottom:'0.65rem', fontStyle:'italic', background:'rgba(139,45,66,0.06)', padding:'0.4rem 0.65rem', borderRadius:6 }}>
                      "{b.special_requests}"
                    </p>
                  )}

                  <GroupBookingPanel booking={b} />

                  {b.status === 'pending' && (
                    <div style={{ display:'flex', gap:'0.4rem' }}>
                      <button className="btn btn-primary btn-sm" style={{ flex:1 }}
                        onClick={() => updateStatus(b.id, 'confirmed')}>{t('dashboard:confirm')}</button>
                      <button className="btn btn-danger btn-sm" style={{ flex:1 }}
                        onClick={() => updateStatus(b.id, 'cancelled')}>{t('dashboard:decline')}</button>
                    </div>
                  )}
                  {b.status === 'confirmed' && (
                    <button className="btn btn-ghost btn-sm" style={{ width:'100%' }}
                      onClick={() => updateStatus(b.id, 'seated')}>{t('dashboard:markSeated')}</button>
                  )}
                  {b.status === 'seated' && (
                    <button className="btn btn-ghost btn-sm" style={{ width:'100%' }}
                      onClick={() => updateStatus(b.id, 'completed')}>{t('dashboard:complete')}</button>
                  )}
                </div>
              </div>
            )
          })}
          {hasMore && (
            <button type="button" className="btn btn-ghost bk-load-more" onClick={() => setLimit(l => l + PAGE_SIZE)}>
              {t('dashboard:bookingsLoadMore')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
