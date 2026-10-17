import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BottomSheet } from '../../components/ui'
import ReviewsList from './ReviewsList'
import './i18n'
import './reviews.css'

/**
 * All reviews of a restaurant (restaurant_reviews), as a large BottomSheet: Top | Newest, compact rows that show only the
 * dish. Keep it mounted and toggle `open`, so it animates out. The list loads on the first open and is kept for the next.
 *   <RestaurantReviewsSheet open onClose restaurantId restaurantName />
 */
export default function RestaurantReviewsSheet({ open, onClose, restaurantId, restaurantName = '' }) {
  const { t } = useTranslation('reviews')
  const [ever, setEver] = useState(!!open)
  useEffect(() => { if (open) setEver(true) }, [open])
  return (
    <BottomSheet
      open={open} onClose={onClose} size="large" id="restaurant-reviews" padded={false} bodyClassName="rv-sheet-body"
      title={restaurantName ? t('restaurantSheetTitle', { name: restaurantName }) : t('dishSheetTitle')}
    >
      {ever && restaurantId ? <ReviewsList restaurantId={restaurantId} /> : null}
    </BottomSheet>
  )
}
