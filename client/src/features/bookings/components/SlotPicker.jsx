import { useTranslation } from 'react-i18next'

/** True when the restaurant has switched online booking off (every slot says so). */
export const allNotBookable = slots => slots.length > 0 && slots.every(s => s.reason === 'not_bookable')

/**
 * The time step: one .slot-btn per slot returned by get_available_slots. Unavailable slots are disabled, never hidden.
 * `state` = { loading, error ({ key } | null), slots }.
 */
export default function SlotPicker({ state, value, onChange, onRetry, onAnotherDay }) {
  const { t } = useTranslation('bookings')

  if (state.loading) {
    return (
      <div className="slot-grid bk-slots" aria-busy="true">
        {Array.from({ length: 15 }, (_, i) => <div key={i} className="skeleton slot-skeleton bk-slot-sk" />)}
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="load-error bk-load-error" role="alert">
        <p>{t(state.error.key)}</p>
        <button type="button" className="btn btn-ghost" onClick={onRetry}>{t('common:retry')}</button>
      </div>
    )
  }

  const { slots } = state
  const availableCount = slots.filter(s => s.available).length

  if (slots.length === 0) {
    return (
      <div className="bk-slot-empty">
        <p className="slot-hint">{t('wizard.closedDay')}</p>
        <button type="button" className="btn btn-ghost" onClick={onAnotherDay}>{t('wizard.anotherDay')}</button>
      </div>
    )
  }

  if (availableCount === 0) {
    return (
      <div className="bk-slot-empty">
        <p className="slot-hint slot-hint-warn" role="status">{t('wizard.noSlots')}</p>
        <button type="button" className="btn btn-ghost" onClick={onAnotherDay}>{t('wizard.anotherDay')}</button>
      </div>
    )
  }

  return (
    <>
      <div className="slot-grid bk-slots" role="group" aria-label={t('wizard.pickTime')}>
        {slots.map(s => (
          <button
            key={s.time} type="button"
            className={`slot-btn${value === s.time ? ' active' : ''}`}
            aria-pressed={value === s.time}
            disabled={!s.available}
            onClick={() => onChange(s.time)}
          >
            {s.time}
          </button>
        ))}
      </div>
      {availableCount < slots.length ? <p className="slot-hint bk-slot-legend">{t('wizard.unavailableHint')}</p> : null}
    </>
  )
}
