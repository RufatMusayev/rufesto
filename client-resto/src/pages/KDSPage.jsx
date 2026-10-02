import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { KDS_STATUS } from '@shared/constants'
import { debounce } from '../lib/debounce'
import { subscribeResync } from '../lib/realtime'
import { friendlyError, writeError } from '../lib/errors'
import ActionBanner from '../components/ActionBanner'

// A ticket whose order is already closed is not the kitchen's any more. The database completes or cancels those
// tickets itself (sql/53); until it has, or where that is not deployed, the board hides them as well.
const CLOSED_ORDER = ['cancelled', 'paid', 'refunded']

function ticketUrgency(minutesElapsed) {
  if (minutesElapsed < 5)  return { level: 'fresh',   color: 'var(--green)' }
  if (minutesElapsed < 12) return { level: 'normal',  color: 'var(--warning)' }
  if (minutesElapsed < 20) return { level: 'late',    color: '#F59E0B' }
  return { level: 'overdue', color: 'var(--red)' }
}

export default function KDSPage() {
  const { restaurantId } = useAuth()
  const { t } = useTranslation(['dashboard', 'common'])
  const [tickets, setTickets] = useState([])
  const [actionError, setActionError] = useState('')
  // Tickets with a write in flight. A ref (not state) so that a second click in the same tick is already refused;
  // `pendingIds` mirrors it for the disabled look.
  const pendingRef = useRef(new Set())
  const [pendingIds, setPendingIds] = useState(() => new Set())
  // How far the database clock is ahead of this device's, learned from the timestamps it wrote.
  const skewRef = useRef(0)
  const [now, refreshNow] = useNow(10000)

  const COLUMNS = [
    { status: 'new',       label: t('colNew'),       color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  textColor: '#fff' },
    { status: 'preparing', label: t('colPreparing'), color: '#BA7517', bg: 'rgba(186,117,23,0.1)',  textColor: '#1A1210' },
    { status: 'ready',     label: t('colReady'),     color: '#2D7A1A', bg: 'rgba(45,122,26,0.1)',   textColor: '#fff' },
  ]

  useEffect(() => {
    if (!restaurantId) return
    loadTickets()
    // kds_tickets is the only table the board needs: tickets are created by a
    // trigger when order_items rows are inserted, so their INSERT events fire
    // here (an `orders` INSERT arrives before any ticket exists). Debounced so
    // a multi-item order is one reload, not one per ticket.
    const debouncedLoad = debounce(loadTickets, 300)
    const channel = supabase
      .channel(`kds-live-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_tickets', filter: `restaurant_id=eq.${restaurantId}` }, debouncedLoad)
    const stop = subscribeResync(channel, debouncedLoad)
    return () => { debouncedLoad.cancel(); stop() }
  }, [restaurantId])

  async function loadTickets() {
    const { data } = await supabase
      .from('kds_tickets')
      .select(`*, order_items!order_item_id(id, quantity, special_request, created_at, dishes(name, category), orders(id, status, tables(table_number)))`)
      .eq('restaurant_id', restaurantId)
      .in('status', ['new', 'preparing', 'ready'])
      .order('priority', { ascending: false })
    const rows = (data || []).filter(tk => !CLOSED_ORDER.includes(tk.order_items?.orders?.status))
    skewRef.current = serverClockSkew(rows)
    // A ticket being advanced right now keeps its local (optimistic) state: a reload that was already in flight
    // would otherwise drop it back into its old column, or bring back one the kitchen has just finished.
    setTickets(prev => rows.flatMap(row => {
      if (!pendingRef.current.has(row.id)) return [row]
      const local = prev.find(p => p.id === row.id)
      return local ? [local] : []
    }))
    refreshNow()
  }

  function setPending(id, on) {
    if (on) pendingRef.current.add(id)
    else pendingRef.current.delete(id)
    setPendingIds(new Set(pendingRef.current))
  }

  async function advance(ticket) {
    const next = KDS_STATUS[ticket.status]?.next
    if (!next || pendingRef.current.has(ticket.id)) return
    setPending(ticket.id, true)
    refreshNow()
    const update = { status: next }
    if (next === 'preparing') update.started_at = new Date().toISOString()
    if (next === 'done') update.completed_at = new Date().toISOString()

    setTickets(prev => next === 'done'
      ? prev.filter(t => t.id !== ticket.id)
      : prev.map(t => t.id === ticket.id ? { ...t, ...update } : t)
    )

    const res = await supabase.from('kds_tickets').update(update).eq('id', ticket.id).select('id, started_at')
    const error = writeError(res)
    if (!error) {
      // The database stamps started_at from its own clock (sql/53); show that value, not this device's.
      const serverStart = res.data?.[0]?.started_at
      if (serverStart && next === 'preparing') {
        // A server time ahead of this device's clock means the device lags: carry that into the elapsed times.
        skewRef.current = Math.max(skewRef.current, Date.parse(serverStart) - Date.now())
        setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, started_at: serverStart } : t))
      }
    } else {
      // revert: put the ticket back exactly as it was before the optimistic change
      setTickets(prev => prev.some(t => t.id === ticket.id)
        ? prev.map(t => t.id === ticket.id ? ticket : t)
        : [...prev, ticket]
      )
      setActionError(friendlyError(error, t))
    }
    setPending(ticket.id, false)
  }

  const allEmpty = tickets.length === 0
  const boardNow = now + skewRef.current

  return (
    <div style={{ padding: '1.25rem', minHeight: '100vh' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <h1 className="page-title">{t('kitchen')}</h1>
          <div style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:100, background:'rgba(45,122,26,0.1)', border:'1px solid rgba(45,122,26,0.2)' }}>
            <span className="dash-live-dot" />
            <span style={{ fontSize:'0.68rem', fontWeight:700, color:'var(--green)' }}>{t('live')}</span>
          </div>
        </div>
        <span style={{ fontFamily:"'JetBrains Mono','Courier New',monospace", fontSize:'0.78rem', color:'var(--t2)' }}>
          {t('activeCount', { count: tickets.length })}
        </span>
      </div>

      {actionError && <ActionBanner message={actionError} onClose={() => setActionError('')} />}

      <div className="kds-board">
        {allEmpty ? (
          <div className="empty" style={{ paddingTop:'4rem', gridColumn:'1/-1' }}>
            <div className="empty-icon" style={{ fontSize:'3.5rem' }}>🧑‍🍳</div>
            <div style={{ fontSize:'1rem', fontWeight:700, marginTop:4 }}>{t('kitchenClear')}</div>
            <div style={{ fontSize:'0.82rem', color:'var(--t3)', marginTop:4 }}>{t('noActiveTickets')}</div>
          </div>
        ) : COLUMNS.map((col) => {
          const colTickets = tickets.filter(t => t.status === col.status)
          return (
            <div className="kds-col" key={col.status}>
              <div className="kds-col-head">
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div className="kds-col-indicator" style={{ background: col.color }} />
                  <span className="kds-col-title" style={{ color: col.color }}>{col.label}</span>
                </div>
                <span className="kds-col-count" style={{ background: col.bg, color: col.color }}>
                  {colTickets.length}
                </span>
              </div>
              <div className="kds-tickets">
                {colTickets.length === 0
                  ? <div className="kds-empty-col">{t('allClear')}</div>
                  : colTickets.map(t => (
                      <KDSTicket key={t.id} ticket={t} now={boardNow} col={col}
                        busy={pendingIds.has(t.id)} onAdvance={() => advance(t)} />
                    ))
                }
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KDSTicket({ ticket, now, onAdvance, col, busy }) {
  const { t } = useTranslation(['dashboard', 'common'])
  const meta = KDS_STATUS[ticket.status]
  const item = ticket.order_items
  const table = item?.orders?.tables?.table_number || '?'
  // kds_tickets has no created_at of its own; it's created 1:1 with its
  // order_item in the same transaction, so order_items.created_at is the
  // ticket's real creation time. started_at (once set) is more precise.
  const since = ticket.started_at || item?.created_at
  // Never negative: `now` can be one tick old, and the timestamp can come from a clock a little ahead of it.
  const elapsed = since ? Math.max(0, Math.floor((now - new Date(since)) / 60000)) : 0
  const urgency = ticketUrgency(elapsed)
  const urgencyClass = urgency.level === 'overdue' ? 'urgency-overdue' : urgency.level === 'late' ? 'urgency-late' : ''

  return (
    <div className={`kds-ticket ${urgencyClass}`}>
      <div className="kds-ticket-head">
        <div className="kds-table-num">{table}</div>
        <div className="kds-elapsed" style={{ color: urgency.color }}>
          {urgency.level === 'overdue' ? `⚠ ${elapsed}m` : `${elapsed}m`}
        </div>
      </div>
      <div className="kds-ticket-body">
        {item ? (
          <>
            <div className="kds-item-row">
              <span className="kds-qty">{item.quantity}×</span>
              <span className="kds-dish-name">{item.dishes?.name || t('unknownDish')}</span>
            </div>
            {item.special_request && (
              <div className="kds-special">📝 {item.special_request}</div>
            )}
          </>
        ) : (
          <div style={{ fontSize:'0.82rem', color:'var(--t3)' }}>{t('common:loading')}</div>
        )}
      </div>
      {meta?.next && (
        <div className="kds-ticket-footer">
          {/* detail > 1 is the 2nd click of a double-click: the list has already re-flowed, so it would hit the next ticket */}
          <button className="kds-advance-btn" onClick={e => { if (e.detail > 1) return; onAdvance() }}
            disabled={busy} aria-busy={busy || undefined}
            style={{ background: col.color, color: col.textColor }}>
            {ticket.status === 'new' ? t('kdsStartPreparing') : ticket.status === 'preparing' ? t('kdsMarkReady') : t('kdsDone')} →
          </button>
        </div>
      )}
    </div>
  )
}

/** Device clock, refreshed every `interval` ms and on demand: [now, refreshNow]. */
function useNow(interval = 10000) {
  const [now, setNow] = useState(Date.now())
  const refresh = useRef(() => setNow(Date.now())).current
  useEffect(() => {
    const id = setInterval(refresh, interval)
    return () => clearInterval(id)
  }, [interval, refresh])
  return [now, refresh]
}

// Clock-skew guard. order_items.created_at is written by the database, so a device whose clock runs behind sees it
// "in the future". The newest such timestamp cannot be later than the real time, so the amount it is ahead of this
// device's clock is added to `now`. (started_at is written by a staff device and is not used: another device's clock
// would skew this one.) Never negative: a clock that runs ahead cannot be told from a long wait, and the elapsed time
// is clamped at 0 anyway.
function serverClockSkew(rows) {
  let newest = 0
  for (const tk of rows) {
    const ms = tk.order_items?.created_at ? Date.parse(tk.order_items.created_at) : NaN
    if (ms > newest) newest = ms
  }
  return newest ? Math.max(0, newest - Date.now()) : 0
}
