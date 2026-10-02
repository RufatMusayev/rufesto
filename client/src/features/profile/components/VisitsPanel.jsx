import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState, MoneyText } from '../../../components/ui'
import { formatBakuDateLong } from '../../bookings/timeFormat'
import Panel, { RowSkeletons } from './Panel'
import { ChevronIcon } from './Icons'

function VisitRow({ visit: v, lang }) {
  const { t } = useTranslation('profile')
  const name = v.restaurant?.name || t('restaurantFallback')
  const content = (
    <div className="pf-row">
      <div className="pf-thumb pf-thumb-logo" aria-hidden="true">
        {v.restaurant?.logo
          ? <img src={v.restaurant.logo} alt="" loading="lazy" />
          : <span>🍽️</span>}
      </div>
      <div className="pf-row-main">
        <div className="pf-row-title">{name}</div>
        <div className="pf-row-sub font-mono">{formatBakuDateLong(v.visitedAt, lang)}</div>
      </div>
      <div className="pf-visit-end">
        <MoneyText value={v.amount} strong />
        {v.billId ? <ChevronIcon size={14} /> : null}
      </div>
    </div>
  )
  return v.billId
    ? <Link to={`/receipt/${v.billId}`} className="card pf-card stagger-item" aria-label={t('viewReceiptOf', { name })}>{content}</Link>
    : <div className="card pf-card stagger-item">{content}</div>
}

/** Profile -> Visits: one row per paid bill (restaurant, date, amount); a bill opens its receipt. */
export default function VisitsPanel({ resource }) {
  const { t, i18n } = useTranslation('profile')
  return (
    <Panel
      resource={resource}
      skeleton={<RowSkeletons count={4} />}
      empty={(
        <EmptyState
          icon="🧾" title={t('noVisitsTitle')} body={t('noVisitsBody')}
          action={<Link to="/explore" className="btn btn-ghost">{t('exploreRestaurants')}</Link>}
        />
      )}
    >
      {visits => (
        <div className="pf-list">
          {visits.map(v => <VisitRow key={v.id} visit={v} lang={i18n.language} />)}
        </div>
      )}
    </Panel>
  )
}
