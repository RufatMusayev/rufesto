import { useTranslation } from 'react-i18next'
import { Pill } from '../../../components/ui'

/** "+120 Resto-Credits". Only when the server reports earned credits above 0. */
export default function LoyaltyEarned({ value }) {
  const { t } = useTranslation('bills')
  if (!(value > 0)) return null
  return (
    <div className="bl-loyalty">
      <Pill tone="gold" icon="🪙">{t('loyaltyEarned', { count: value })}</Pill>
    </div>
  )
}
