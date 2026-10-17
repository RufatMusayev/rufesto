import { useTranslation } from 'react-i18next'
import { BottomSheet } from '../../components/ui'
import ReviewsList from './ReviewsList'
import './i18n'
import './reviews.css'

/** "See all N reviews" of a dish: Top | Newest over the dish sheet. Self-managed: mounted while open, onClose unmounts it after the exit. */
export default function DishReviewsSheet({ dishId, onClose }) {
  const { t } = useTranslation('reviews')
  return (
    <BottomSheet onClose={onClose} size="large" id="dish-reviews" padded={false} bodyClassName="rv-sheet-body" title={t('dishSheetTitle')}>
      <ReviewsList dishId={dishId} />
    </BottomSheet>
  )
}
