import { useTranslation } from 'react-i18next'
import { formatPrice } from '../../../lib/format'
import { localeTag } from '../../../lib/time'
import { formatCalendarDate } from '../dates'

// The stat cards of the Overview. Money is split three ways and never mixed:
//   Revenue      what was collected from settled bills (VAT included, tips not)
//   Open orders  placed but not paid yet; NOT part of revenue
//   Tips         left for the staff, kept apart
// `stats` is built by pages/DashboardHome.jsx; a null value means "not available" and hides the card.
export default function OverviewStats({ stats, showBusiest }) {
  const { t, i18n } = useTranslation('dashboard')
  const tag = localeTag(i18n.language)
  const busiest = showBusiest ? stats.busiest : null

  return (
    <div className="ov-stats">
      <div className="stat-card ov-stat ov-stat--gold">
        <div className="stat-value">{formatPrice(stats.revenue)}</div>
        <div className="stat-label">{t('dashboard:ovRevenue')}</div>
        <div className="stat-sub">{t('dashboard:ovRevenueSub')}</div>
      </div>
      <div className="stat-card ov-stat ov-stat--warn">
        <div className="stat-value">{formatPrice(stats.openAmount)}</div>
        <div className="stat-label">{t('dashboard:ovOpenOrders')}</div>
        <div className="stat-sub">{t('dashboard:ovOpenOrdersSub', { count: stats.openCount })}</div>
      </div>
      {stats.tips !== null && (
        <div className="stat-card ov-stat ov-stat--accent">
          <div className="stat-value">{formatPrice(stats.tips)}</div>
          <div className="stat-label">{t('dashboard:ovTips')}</div>
          <div className="stat-sub">{t('dashboard:ovTipsSub')}</div>
        </div>
      )}
      <div className="stat-card ov-stat ov-stat--blue">
        <div className="stat-value">{stats.orderCount}</div>
        <div className="stat-label">{t('dashboard:ovOrders')}</div>
      </div>
      {stats.avgBill !== null && (
        <div className="stat-card ov-stat ov-stat--blue">
          <div className="stat-value">{formatPrice(stats.avgBill)}</div>
          <div className="stat-label">{t('dashboard:ovAvgBill')}</div>
        </div>
      )}
      {stats.guests !== null && (
        <div className="stat-card ov-stat ov-stat--blue">
          <div className="stat-value">{stats.guests}</div>
          <div className="stat-label">{t('dashboard:ovGuests')}</div>
        </div>
      )}
      {busiest && (
        <div className="stat-card ov-stat ov-stat--gold">
          <div className="stat-value ov-stat-text">{formatCalendarDate(busiest.day, tag)}</div>
          <div className="stat-label">{t('dashboard:ovBusiestDay')}</div>
          <div className="stat-sub">{t('dashboard:ovBusiestSub', { amount: formatPrice(busiest.revenue), count: busiest.orders })}</div>
        </div>
      )}
      <div className="stat-card ov-stat ov-stat--green">
        <div className="stat-value">
          {stats.activeTables}
          <span className="ov-stat-of">/{stats.totalTables}</span>
        </div>
        <div className="stat-label">{t('dashboard:statActiveTables')}</div>
      </div>
      <div className="stat-card ov-stat ov-stat--muted">
        <div className="stat-value">
          {stats.availDishes}
          <span className="ov-stat-of">/{stats.totalDishes}</span>
        </div>
        <div className="stat-label">{t('dashboard:statMenuAvailable')}</div>
      </div>
    </div>
  )
}
