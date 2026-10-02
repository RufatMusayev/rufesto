import { useTranslation } from 'react-i18next'
import { TIMELINE_STEPS, statusView } from '../orderStatus'

/**
 * Placed > Preparing > Ready > Served as four dots. The words are drawn by CSS from `data-label` (the status badge
 * already says the current one in text), each stop keeps its name as aria-label. A cancelled or refunded order is
 * off the timeline: the badge says it and nothing is drawn.
 */
export default function OrderTimeline({ status }) {
  const { t } = useTranslation('table')
  const { step } = statusView(status)
  if (step < 0) return null
  return (
    <ol className="dn-timeline" aria-label={t('timelineLabel')}>
      {TIMELINE_STEPS.map((key, i) => {
        const state = i < step ? 'is-done' : i === step ? 'is-current' : ''
        return (
          <li
            key={key}
            className={`dn-step ${state}`.trim()}
            data-label={t(key)}
            aria-label={t(key)}
            aria-current={i === step ? 'step' : undefined}
          >
            <span className="dn-step-dot" aria-hidden="true" />
          </li>
        )
      })}
    </ol>
  )
}
