import { useTranslation } from 'react-i18next'

// Marks a payment taken through the DEMO provider (no money moves).
export default function DemoBadge() {
  const { t } = useTranslation('v2')
  return <span className="v2-demo-badge" title={t('demoNotice')}>{t('demoBadge')}</span>
}
