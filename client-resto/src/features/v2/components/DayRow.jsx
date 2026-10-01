import { useTranslation } from 'react-i18next'
import Switch from './Switch'

// One weekday of the hours editor: open/closed switch, two time inputs and, on
// the first open day, "Copy to all days". An invalid range marks the row red.
export default function DayRow({ day, name, invalid, showCopy, onChange, onCopy }) {
  const { t } = useTranslation('v2')
  const open = !day.isClosed
  const id = `v2-day-${day.dow}`
  return (
    <div className={`v2-day${invalid ? ' is-invalid' : ''}${open ? '' : ' is-closed'}`}>
      <div className="v2-day-name">{name}</div>

      <div className="v2-day-switch">
        <Switch id={id} checked={open} onChange={on => onChange({ isClosed: !on })} label={`${name}: ${open ? t('dayOpen') : t('dayClosed')}`} />
        <span className="v2-day-state">{open ? t('dayOpen') : t('dayClosed')}</span>
      </div>

      {open && (
        <div className="v2-day-times">
          <label className="v2-sr-only" htmlFor={`${id}-open`}>{`${name}: ${t('opensAt')}`}</label>
          <input
            id={`${id}-open`}
            type="time"
            className="input v2-time"
            value={day.open}
            onChange={e => onChange({ open: e.target.value })}
            aria-invalid={invalid}
          />
          <span className="v2-day-dash" aria-hidden="true">–</span>
          <label className="v2-sr-only" htmlFor={`${id}-close`}>{`${name}: ${t('closesAt')}`}</label>
          <input
            id={`${id}-close`}
            type="time"
            className="input v2-time"
            value={day.close}
            onChange={e => onChange({ close: e.target.value })}
            aria-invalid={invalid}
          />
        </div>
      )}

      {showCopy && (
        <button type="button" className="btn btn-ghost btn-sm v2-day-copy" onClick={onCopy}>{t('copyToAll')}</button>
      )}
      {invalid && <div className="v2-field-error v2-day-error" role="alert">{t('hoursInvalid')}</div>}
    </div>
  )
}
