import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { formatPrice } from '../../../lib/helpers'
import { TIP_MAX, TIP_PERCENTS, tipForShare } from '../money'

/** Tip chips 0 · 5% · 10% · 15% · Custom, computed on the share the guest pays (rounded to 0.10). */
export default function TipPicker({ share, tipSel, customOn, valid, tip, onPercent, onCustom }) {
  const { t } = useTranslation('bills')
  const hintId = useId()
  const max = TIP_MAX.toFixed(2)

  return (
    <section className="bl-section" aria-labelledby="bl-tip-title">
      <h2 id="bl-tip-title" className="bl-section-title">{t('tipTitle')}</h2>
      <div className="bl-chips" role="radiogroup" aria-labelledby="bl-tip-title">
        {TIP_PERCENTS.map(pct => {
          const on = !customOn && tipSel.pct === pct
          return (
            <button
              key={pct} type="button" role="radio" aria-checked={on}
              className={`chip bl-chip${on ? ' active' : ''}`} onClick={() => onPercent(pct)}
            >
              {pct === 0 ? t('tipNone') : `${pct}%`}
              {pct > 0 ? <span className="bl-chip-sub">{formatPrice(tipForShare(share, pct))}</span> : null}
            </button>
          )
        })}
        <button
          type="button" role="radio" aria-checked={customOn}
          className={`chip bl-chip${customOn ? ' active' : ''}`}
          onClick={() => onCustom(customOn ? tipSel.custom : '')}
        >
          {t('tipCustom')}
        </button>
      </div>
      {customOn ? (
        <div className="bl-custom">
          <label className="label" htmlFor="bl-tip-custom">{t('tipCustomLabel')}</label>
          <input
            id="bl-tip-custom" className="input bl-input-money" type="text" inputMode="decimal"
            autoComplete="off" placeholder="0.00" maxLength={6}
            value={tipSel.custom} onChange={e => onCustom(e.target.value)}
            aria-invalid={!valid} aria-describedby={hintId}
          />
          <p id={hintId} className={valid ? 'bl-hint' : 'bl-hint bl-hint-error'}>
            {valid ? t('tipCustomHint', { max }) : t('tipCustomInvalid', { max })}
          </p>
        </div>
      ) : null}
      {tip > 0 ? <p className="bl-hint">{t('tipFor', { amount: formatPrice(tip) })}</p> : null}
    </section>
  )
}
