import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState, Pill } from '../../../components/ui'
import { timeAgo, categoryEmoji, dishBackground } from '../../../lib/helpers'
import Panel, { RowSkeletons } from './Panel'

function ReviewRow({ review: r, lang }) {
  const { t } = useTranslation('profile')
  const slug = r.restaurant?.slug
  const content = (
    <div className="pf-row">
      <div className="pf-thumb" style={{ background: dishBackground(r.dish.category) }} aria-hidden="true">
        {categoryEmoji(r.dish.category)}
      </div>
      <div className="pf-row-main">
        <div className="pf-row-top">
          <div className="pf-row-title">{r.dish.name || t('dish')}</div>
          <span className="pf-stars" role="img" aria-label={t('ratingOf', { count: r.rating })}>
            {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
          </span>
        </div>
        <div className="pf-row-sub font-mono">
          {[r.restaurant?.name, timeAgo(r.createdAt, lang)].filter(Boolean).join(' · ')}
        </div>
        {r.body ? <p className="pf-row-text">{r.body}</p> : null}
        {r.verified ? <div className="pf-row-pill"><Pill tone="green">{t('verifiedVisit')}</Pill></div> : null}
      </div>
    </div>
  )
  return slug
    ? <Link to={`/restaurant/${slug}`} className="card pf-card stagger-item">{content}</Link>
    : <div className="card pf-card stagger-item">{content}</div>
}

/** Profile -> Reviews: the guest's own dish reviews. */
export default function ReviewsPanel({ resource }) {
  const { t, i18n } = useTranslation('profile')
  return (
    <Panel
      resource={resource}
      skeleton={<RowSkeletons count={3} tall />}
      empty={<EmptyState icon="⭐" title={t('noReviews')} body={t('noReviewsHint')} />}
    >
      {reviews => (
        <div className="pf-list">
          {reviews.map(r => <ReviewRow key={r.id} review={r} lang={i18n.language} />)}
        </div>
      )}
    </Panel>
  )
}
