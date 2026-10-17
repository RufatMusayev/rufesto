import { useTranslation } from 'react-i18next'
import ChipScroller from '../../../components/ChipScroller'
import { bakuDateString } from '../dates'

/**
 * Preset chips for a history view ("Today", "Yesterday", ...). With the 'day' preset a date input follows, capped at
 * today. `state` is what hooks/useDayRange.js returns; `presets` lists the chips to show (historyRange.js).
 */
export default function DayRangeChips({ state, presets, label }) {
  const { t } = useTranslation('v2')
  const { preset, choose, picked, setPicked, range } = state
  return (
    <div className="v2-dayrange">
      <ChipScroller role="group" aria-label={label || t('rangeLabel')}>
        {presets.map(p => (
          <button key={p} type="button" className={`chip${preset === p ? ' active' : ''}`} aria-pressed={preset === p} onClick={() => choose(p)}>
            {t(`hist_${p}`)}
          </button>
        ))}
      </ChipScroller>
      {preset === 'day' && (
        <div className="v2-dayrange-pick">
          <label className="v2-sr-only" htmlFor="v2-dayrange-input">{t('histPickDay')}</label>
          <input
            id="v2-dayrange-input"
            type="date"
            className="input v2-dayrange-input"
            value={picked || range.from}
            max={bakuDateString()}
            onChange={e => setPicked(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}
