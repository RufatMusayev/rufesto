import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/ui'
import CompactReview from '../../reviews/CompactReview'
import { mapProfileReview } from '../../reviews/mapper'
import Panel, { RowSkeletons } from './Panel'

/** Profile -> Reviews: the guest's own dish reviews as compact "own" rows (dish picture, dish name, venue below, stars). */
export default function ReviewsPanel({ resource }) {
  const { t } = useTranslation('profile')
  const items = useMemo(() => (resource.data || []).map(mapProfileReview), [resource.data])
  return (
    <Panel
      resource={resource}
      skeleton={<RowSkeletons count={3} tall />}
      empty={<EmptyState icon="⭐" title={t('noReviews')} body={t('noReviewsHint')} />}
    >
      {() => (
        <div className="rv-flat">
          {items.map(r => <CompactReview key={r.id} item={r} variant="own" showActions={false} />)}
        </div>
      )}
    </Panel>
  )
}
