import { useTranslation } from 'react-i18next'
import { Pill } from '../../../components/ui'

/** DEMO pill. Shown wherever the demo method is selectable, processing or settled. */
export function DemoBadge() {
  const { t } = useTranslation('bills')
  return <Pill tone="demo">{t('demoBadge')}</Pill>
}

/** "Demo payment — no money moves". */
export function DemoNotice({ className = '' }) {
  const { t } = useTranslation('bills')
  return <p className={`bl-demo-notice ${className}`.trim()}>{t('demoNotice')}</p>
}
