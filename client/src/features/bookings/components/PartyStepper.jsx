import { useTranslation } from 'react-i18next'
import { MinusIcon, PlusIcon } from './Icons'

/** Party size 1-12: big DM Mono number between a minus and a plus button. */
export default function PartyStepper({ value, onChange, min = 1, max = 12 }) {
  const { t } = useTranslation('bookings')
  return (
    <div className="bk-stepper" role="group" aria-label={t('wizard.partySize')}>
      <button
        type="button" className="icon-btn bk-stepper-btn" aria-label={t('wizard.fewer')}
        disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}
      >
        <MinusIcon />
      </button>
      <div className="bk-stepper-value">
        <span className="bk-stepper-num font-mono" aria-live="polite">{value}</span>
        <span className="bk-stepper-unit">{t('wizard.guests', { count: value })}</span>
      </div>
      <button
        type="button" className="icon-btn bk-stepper-btn" aria-label={t('wizard.more')}
        disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}
      >
        <PlusIcon />
      </button>
    </div>
  )
}
