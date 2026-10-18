// Registers the `reviews` namespace so the feature works on its own (same pattern as features/social/i18n.js).
import i18n from '../../lib/i18n'
import reviewsEN from '../../locales/en/reviews.json'
import reviewsAZ from '../../locales/az/reviews.json'
import reviewsRU from '../../locales/ru/reviews.json'

i18n.addResourceBundle('en', 'reviews', reviewsEN, true, true)
i18n.addResourceBundle('az', 'reviews', reviewsAZ, true, true)
i18n.addResourceBundle('ru', 'reviews', reviewsRU, true, true)

export default i18n
