import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { TABLE_COLORS } from '@shared/constants'
import { localeTag } from '../lib/time'
import { debounce } from '../lib/debounce'
import { subscribeResync } from '../lib/realtime'
import { tableStateLabel } from '../components/waiter/waiterHelpers'
import { fetchDayStats, fetchRangeOrders, fetchTipTotal } from '../features/v2/historyApi'
import { SUMMARY_PRESETS } from '../features/v2/historyRange'
import { summariseOrders } from '../features/v2/historySummary'
import useDayRange from '../features/v2/hooks/useDayRange'
import DayRangeChips from '../features/v2/components/DayRangeChips'
import OverviewOrderRow from '../features/v2/components/OverviewOrderRow'
import OverviewStats from '../features/v2/components/OverviewStats'
import '../features/v2/styles.css'

// Tables nobody is using; `maintenance` is out of service, not busy.
const IDLE_TABLE_STATES = ['free', 'cleared', 'maintenance']
// The floor map legend: every state a table can show, in the order guests move through them.
const LEGEND_STATES = ['free', 'reserved', 'occupied', 'ordering', 'awaiting_payment', 'cleared', 'maintenance']
const RECENT_ORDERS = 8

export default function DashboardHome() {
  const { restaurantId } = useAuth()
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const rangeState = useDayRange('today')
  const { range, preset } = rangeState
  const [stats, setStats] = useState(null)
  const [recentOrders, setRecentOrders] = useState([])
  const [tables, setTables] = useState([])
  const [pendingBookings, setPendingBookings] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  // The realtime handlers must always load the range on screen, and an answer for a range the user has already
  // left must not overwrite the newer one.
  const rangeRef = useRef(range)
  rangeRef.current = range
  const loadRef = useRef(null)
  const seq = useRef(0)

  async function loadAll() {
    const mine = ++seq.current
    const day = rangeRef.current

    const [ordersR, tablesR, dishesR, bookingsR, kdsActiveR, dayStatsR] = await Promise.all([
      fetchRangeOrders(restaurantId, day),
      supabase.from('tables').select('id,table_number,state,capacity,sections(name)').eq('restaurant_id', restaurantId).eq('is_active', true).order('table_number'),
      supabase.from('dishes').select('available').eq('restaurant_id', restaurantId),
      supabase.from('bookings').select('id').eq('restaurant_id', restaurantId).eq('status', 'pending'),
      // Active KDS tickets, not orders — an order can hold several tickets
      // (or none left active) so counting orders overstates/understates load.
      supabase.from('kds_tickets').select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId).in('status', ['new', 'preparing', 'ready']),
      fetchDayStats(restaurantId, day),
    ])
    // Tips: part of restaurant_day_stats; until that exists, the tip report of the same range.
    const tips = dayStatsR.data ? dayStatsR.data.tips : (await fetchTipTotal(restaurantId, day)).data
    if (mine !== seq.current) return

    const orders = ordersR.data || []
    const summary = summariseOrders(orders)
    const ds = dayStatsR.data
    const tbl = tablesR.data || []
    const dishes = dishesR.data || []

    setStats({
      // Revenue is money collected (settled bills), never the value of orders still open.
      revenue: ds ? ds.revenue : summary.revenue,
      tips: tips ?? null,
      openAmount: summary.openAmount,
      openCount: summary.openCount,
      orderCount: ds ? ds.orders : summary.orderCount,
      guests: ds ? ds.guests : null,
      avgBill: ds ? ds.avgBill : (summary.paidCount > 0 ? summary.revenue / summary.paidCount : null),
      busiest: ds ? ds.busiest : summary.busiest,
      activeTables: tbl.filter(row => !IDLE_TABLE_STATES.includes(row.state)).length,
      totalTables: tbl.length,
      availDishes: dishes.filter(d => d.available).length,
      totalDishes: dishes.length,
      kdsActive: kdsActiveR.count || 0,
    })
    setTables(tbl)
    setRecentOrders(orders.slice(0, RECENT_ORDERS))
    setPendingBookings(bookingsR.data?.length || 0)
    setRefreshing(false)
  }
  loadRef.current = loadAll

  // Realtime: every table below feeds a number on this page: orders (revenue / open / recent), tables (floor),
  // kds_tickets (kitchen alert count), bookings (pending alert), dishes (menu availability).
  useEffect(() => {
    if (!restaurantId) return undefined
    const debouncedLoad = debounce(() => loadRef.current(), 600)
    const ch = supabase
      .channel(`dash-home-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `restaurant_id=eq.${restaurantId}` }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_tickets', filter: `restaurant_id=eq.${restaurantId}` }, debouncedLoad)
    // bookings and dishes sit on their own channel: if either isn't in the
    // supabase_realtime publication yet, that must not fail the channel above.
    const extra = supabase
      .channel(`dash-home-extra-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `restaurant_id=eq.${restaurantId}` }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes', filter: `restaurant_id=eq.${restaurantId}` }, debouncedLoad)

    const stopMain = subscribeResync(ch, debouncedLoad)
    const stopExtra = subscribeResync(extra, debouncedLoad)
    return () => { debouncedLoad.cancel(); stopMain(); stopExtra() }
  }, [restaurantId])

  // First load, and again whenever the range (or restaurant) changes.
  useEffect(() => {
    if (!restaurantId) return
    setRefreshing(true)
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, rangeState.key])

  if (!stats) return (
    <div className="ov-loading">
      <span className="spinner" /> {t('common:loadingDashboard')}
    </div>
  )

  const today = new Date().toLocaleDateString(localeTag(i18n.language), { day: 'numeric', month: 'short' })

  return (
    <div className="ov-page" aria-busy={refreshing || undefined}>
      <div className="ov-head">
        <h1 className="page-title">{t('navOverview')}</h1>
        <div className="page-live ov-live">
          <span className="dash-live-dot" />
          {t('liveDate', { date: today })}
        </div>
      </div>

      <DayRangeChips state={rangeState} presets={SUMMARY_PRESETS} />

      <div className={refreshing ? 'ov-body is-refreshing' : 'ov-body'}>
        <OverviewStats stats={stats} showBusiest={preset === 'week'} />

        {(stats.kdsActive > 0 || pendingBookings > 0) && (
          <div className="ov-alerts">
            {stats.kdsActive > 0 && (
              <Link to="/kds" className="alert-banner alert-banner--warn">
                {t('alertKitchen', { count: stats.kdsActive })}
              </Link>
            )}
            {pendingBookings > 0 && (
              <Link to="/bookings" className="alert-banner alert-banner--info">
                {t('alertBookings', { count: pendingBookings })}
              </Link>
            )}
          </div>
        )}

        <div className="dash-grid">
          <div>
            <div className="ov-section-head">
              <div className="dash-section-title">{t('recentOrders')}</div>
              <Link to="/orders" className="ov-link">{t('viewAll')}</Link>
            </div>

            {recentOrders.length === 0 ? (
              <div className="ov-empty">{t(preset === 'today' ? 'noOrdersToday' : 'noOrdersRange')}</div>
            ) : (
              <div className="ov-orders">
                {recentOrders.map(o => <OverviewOrderRow key={o.id} order={o} />)}
              </div>
            )}
          </div>

          <div>
            <div className="ov-section-head">
              <div className="dash-section-title">{t('tables')}</div>
              <Link to="/tables" className="ov-link">{t('manage')}</Link>
            </div>

            <div className="ov-floor">
              <div className="ov-floor-grid">
                {tables.map(row => {
                  const tc = TABLE_COLORS[row.state] || TABLE_COLORS.cleared
                  return (
                    <div key={row.id} className="ov-floor-cell" title={`${row.table_number} · ${tableStateLabel(t, row.state)} · ${row.capacity}`}
                      style={{ background: tc.bg, borderColor: tc.border, color: tc.color }}>
                      {row.table_number}
                    </div>
                  )
                })}
              </div>

              <div className="ov-legend">
                {LEGEND_STATES.map(k => (
                  <div key={k} className="ov-legend-item">
                    <span className="ov-legend-dot" style={{ background: TABLE_COLORS[k].color }} />
                    {tableStateLabel(t, k)}
                  </div>
                ))}
              </div>
            </div>

            <div className="dash-section-title ov-quick-title">{t('quickActions')}</div>
            <div className="ov-quick">
              {[
                { to: '/kds', icon: '🧑‍🍳', label: t('openKitchen') },
                { to: '/menu', icon: '📋', label: t('toggleMenuItems') },
                { to: '/bookings', icon: '📅', label: t('manageBookings') },
              ].map(a => (
                <Link key={a.to} to={a.to} className="ov-quick-link">
                  <span aria-hidden="true">{a.icon}</span> {a.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
