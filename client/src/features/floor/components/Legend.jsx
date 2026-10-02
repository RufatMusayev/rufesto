import { useTranslation } from 'react-i18next'
import { FLOOR_STATES } from '../states'

/** Colour key: the table states in view, plus the chair looks. Pure CSS swatches, no inline styles. */
export default function Legend({ states, showMine }) {
  const { t } = useTranslation('floor')
  return (
    <ul className="fl-legend" aria-label={t('legendLabel')}>
      {FLOOR_STATES.filter(s => states.has(s)).map(s => (
        <li key={s} className="fl-legend-item">
          <i className={`fl-swatch fl-st fl-st-${s}`} aria-hidden="true" />{t(`state.${s}`)}
        </li>
      ))}
      <li className="fl-legend-item"><i className="fl-chair-sw is-free" aria-hidden="true" />{t('seatFree')}</li>
      <li className="fl-legend-item"><i className="fl-chair-sw is-taken" aria-hidden="true" />{t('seatTaken')}</li>
      {showMine && <li className="fl-legend-item"><i className="fl-chair-sw is-mine" aria-hidden="true" />{t('seatYou')}</li>}
    </ul>
  )
}
