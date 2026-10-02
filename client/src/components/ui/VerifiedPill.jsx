import { useTranslation } from 'react-i18next'
import Pill from './Pill'

/** "Verified visit": the review comes from a guest who ate there (reviews.is_verified, set by the server). */
export default function VerifiedPill() {
  const { t } = useTranslation('common')
  return <Pill tone="green" icon="&#10003;">{t('verifiedVisit')}</Pill>
}
