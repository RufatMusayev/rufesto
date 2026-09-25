import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { timeAgo } from '@shared/helpers'
import { BOOKING_STATUS_STYLE } from '@shared/constants'
import { localeTag } from '../lib/time'

const STATUSES = ['all', 'pending', 'confirmed', 'seated', 'completed', 'cancelled']

const STATUS_LABEL_KEYS = {
  pending: 'bkPending', confirmed: 'bkConfirmed', seated: 'bkSeated',
  completed: 'bkCompleted', cancelled: 'bkCancelled',
}

export default function BookingsPage() {
  const { restaurantId } = useAuth()
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const [bookings, setBookings] = useState([])
  const [filter,   setFilter]   = useState('all')
  const [loading,  setLoading]  = useState(true)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!restaurantId) return
    load()

    const channel = supabase
      .channel(`dash-bookings-${restaurantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bookings',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, () => load())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [restaurantId])

  async function load() {
    const { data } = await supabase
      .from('bookings')
      .select('*, users(name, email, phone), tables(table_number)')
      .eq('restaurant_id', restaurantId)
      .order('reserved_from', { ascending: false })
      .limit(50)
    setBookings(data || [])
    setLoading(false)
  }

  async function updateStatus(id, status) {
    const prevStatus = bookings.find(b => b.id === id)?.status
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b))
    const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
    if (error) {
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: prevStatus } : b))
      setActionError(t('dashboard:actionFailed'))
    }
  }

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)

  return (
    <div style={{ padding: '1.25rem' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', paddingBottom:'1rem', borderBottom:'1px solid var(--border)' }}>
        <h1 className="page-title">{t('dashboard:bookingsTitle')}</h1>
        <span style={{ fontSize:'0.78rem', color:'var(--t3)' }}>
          {t('dashboard:bookingCount', { count: filtered.length })}
        </span>
      </div>

      {actionError && (
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
          padding:'0.6rem 0.85rem', borderRadius:10, marginBottom:'0.85rem',
          background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)',
          color:'var(--red)', fontSize:'0.8rem', fontWeight:500,
        }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} style={{ background:'none', border:'none', color:'inherit', cursor:'pointer', fontSize:'1rem', lineHeight:1 }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', marginBottom: '1.25rem' }}>
        {STATUSES.map(s => (
          <button key={s} className={`chip${filter === s ? ' active' : ''}`}
            onClick={() => setFilter(s)}>
            {s === 'all'
              ? t('dashboard:bookingFilterAll', { count: bookings.length })
              : `${t(`dashboard:${STATUS_LABEL_KEYS[s]}`)} (${bookings.filter(b => b.status === s).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--t3)' }}>{t('dashboard:loadingBookings')}</div>
      ) : filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">📋</div>{t('dashboard:noBookings')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(b => {
            const sc = BOOKING_STATUS_STYLE[b.status] || BOOKING_STATUS_STYLE.pending
            const dt = new Date(b.reserved_from)
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
                      <div style={{ fontSize:'0.72rem', color:'var(--t2)', marginTop:2 }}>
                        {b.users?.email || b.users?.phone || '—'}
                      </div>
                    </div>
                    <span style={{
                      fontSize:'0.62rem', fontWeight:700, padding:'3px 9px', borderRadius:100,
                      background: sc.bg, color: sc.color,
                      textTransform:'uppercase', letterSpacing:0.3,
                    }}>{t(`dashboard:${STATUS_LABEL_KEYS[b.status]}`) || b.status}</span>
                  </div>

                  <div style={{ display:'flex', gap:'0.65rem', fontSize:'0.8rem', color:'var(--t2)', marginBottom:'0.5rem', flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontWeight:600, color:'var(--t1)' }}>
                      {dt.toLocaleDateString(localeTag(i18n.language), { day:'numeric', month:'short' })}
                    </span>
                    <span>{t('dashboard:atTime', { time: dt.toLocaleTimeString(localeTag(i18n.language), { hour:'2-digit', minute:'2-digit' }) })}</span>
                    <span>·</span>
                    <span>{t('dashboard:bookingGuests', { count: b.party_size })}</span>
                    {b.tables?.table_number && <span>· {t('common:tableLabel', { number: b.tables.table_number })}</span>}
                  </div>

                  {b.special_requests && (
                    <p style={{ fontSize:'0.78rem', color:'var(--accent)', marginBottom:'0.65rem', fontStyle:'italic', background:'rgba(139,45,66,0.06)', padding:'0.4rem 0.65rem', borderRadius:6 }}>
                      "{b.special_requests}"
                    </p>
                  )}

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
        </div>
      )}
    </div>
  )
}
