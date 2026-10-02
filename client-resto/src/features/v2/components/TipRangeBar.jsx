import { useTranslation } from 'react-i18next'

const PRESETS = ['today', 'week', 'month', 'custom']

// Range chips for the tips screens; "Custom" reveals two date inputs.
// `state` is what hooks/useTipRange.js returns.
export default function TipRangeBar({ state }) {
  const { t } = useTranslation('v2')
  const { preset, choose, custom, setCustom, valid, problem } = state
  return (
    <div className="v2-range">
      <div className="v2-chips no-scrollbar" role="group" aria-label={t('rangeLabel')}>
        {PRESETS.map(p => (
          <button key={p} type="button" className={`chip${preset === p ? ' active' : ''}`} aria-pressed={preset === p} onClick={() => choose(p)}>
            {t(`range_${p}`)}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="v2-range-custom">
          <div className="v2-field">
            <label className="label" htmlFor="v2-range-from">{t('rangeFrom')}</label>
            <input
              id="v2-range-from"
              type="date"
              className={`input${valid ? '' : ' is-invalid'}`}
              value={custom.from}
              max={custom.to || undefined}
              onChange={e => setCustom(c => ({ ...c, from: e.target.value }))}
            />
          </div>
          <div className="v2-field">
            <label className="label" htmlFor="v2-range-to">{t('rangeTo')}</label>
            <input
              id="v2-range-to"
              type="date"
              className={`input${valid ? '' : ' is-invalid'}`}
              value={custom.to}
              min={custom.from || undefined}
              onChange={e => setCustom(c => ({ ...c, to: e.target.value }))}
            />
          </div>
          {!valid && <p className="v2-field-error v2-range-error" role="alert">{t(problem === 'long' ? 'rangeTooLong' : 'rangeInvalid')}</p>}
        </div>
      )}
    </div>
  )
}
