import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import BottomSheet from '../../components/ui/BottomSheet'
import { cuisineLabel } from '../discover/cuisine'
import { DIETS, EMPTY_FILTERS, KMS, PRICES } from './filters'

function Segmented({ label, options, value, onChange, disabled = false }) {
  return (
    <div className="sr-seg" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button
          key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} disabled={disabled}
          className={`sr-seg-btn${value === o.value ? ' is-on' : ''}`} onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Filters (BottomSheet, auto height): Open now, Cuisine, Price, Distance, Diet. The choices are a draft until
 * "Show results"; Reset clears the draft. Distance needs the location: without it the control is disabled and a
 * "Use my location" link asks for it. The filters are applied by the server (search() browse mode when the text is empty).
 */
export default function FiltersSheet({ open, onClose, filters, chips, geo, onApply }) {
  const { t } = useTranslation('search')
  const { t: ts } = useTranslation('social')
  const [draft, setDraft] = useState(filters)
  useEffect(() => { if (open) setDraft(filters) }, [open, filters])
  const set = patch => setDraft(d => ({ ...d, ...patch }))
  const hasGps = !!geo.coords
  const toggleDiet = d => set({ diet: draft.diet.includes(d) ? draft.diet.filter(x => x !== d) : [...draft.diet, d] })

  return (
    <BottomSheet
      open={open} onClose={onClose} size="auto" id="search-filters" title={t('filters')}
      header={(
        <div className="sr-fs-head">
          <h2 className="sr-fs-title">{t('filters')}</h2>
          <button type="button" className="sr-fs-reset" onClick={() => setDraft(EMPTY_FILTERS)}>{t('reset')}</button>
        </div>
      )}
      footer={<button type="button" className="btn btn-primary sr-fs-go" onClick={() => onApply(draft)}>{t('show')}</button>}
    >
      <div className="sr-fs">
        <div className="sr-fs-row">
          <span id="sr-fs-open">{t('open')}</span>
          <button
            type="button" role="switch" aria-checked={draft.open} aria-labelledby="sr-fs-open"
            className={`sr-switch${draft.open ? ' is-on' : ''}`} onClick={() => set({ open: !draft.open })}
          >
            <span className="sr-switch-knob" />
          </button>
        </div>

        <h3 className="sr-fs-h">{t('cuisine')}</h3>
        <div className="sr-fs-chips" role="radiogroup" aria-label={t('cuisine')}>
          <button type="button" role="radio" aria-checked={!draft.cuisine} className={`chip${draft.cuisine ? '' : ' active'}`} onClick={() => set({ cuisine: null })}>{t('any')}</button>
          {chips.map(c => {
            const on = (draft.cuisine || '').toLowerCase() === c.key.toLowerCase()
            return (
              <button key={c.key} type="button" role="radio" aria-checked={on} className={`chip${on ? ' active' : ''}`} onClick={() => set({ cuisine: c.key })}>
                {cuisineLabel(ts, c.key)}
              </button>
            )
          })}
        </div>

        <h3 className="sr-fs-h">{t('price')}</h3>
        <Segmented
          label={t('price')} value={draft.price} onChange={price => set({ price })}
          options={[{ value: null, label: t('any') }, ...PRICES.map(p => ({ value: p, label: '₼'.repeat(p) }))]}
        />

        <h3 className="sr-fs-h">{t('distance')}</h3>
        <Segmented
          label={t('distance')} value={draft.km} onChange={km => set({ km })} disabled={!hasGps}
          options={[{ value: null, label: t('any') }, ...KMS.map(k => ({ value: k, label: t('km', { count: k }) }))]}
        />
        {!hasGps && (
          <p className="sr-fs-note">
            {t('needLocation')}{' '}
            {geo.supported && (
              <button type="button" className="sr-link" onClick={geo.request} disabled={geo.status === 'asking'}>{t('useLocation')}</button>
            )}
          </p>
        )}

        <h3 className="sr-fs-h">{t('diet')}</h3>
        <div className="sr-fs-chips">
          {DIETS.map(d => (
            <button key={d} type="button" aria-pressed={draft.diet.includes(d)} className={`chip${draft.diet.includes(d) ? ' active' : ''}`} onClick={() => toggleDiet(d)}>
              {t(`diets.${d}`)}
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  )
}
