import { useState } from 'react'
import { rangeForPreset, rangeKey } from '../historyRange'

/**
 * Preset day range for the history views: `preset` is one of historyRange.js' presets and `picked` the day chosen
 * with the date input (only used by the 'day' preset). The range is recomputed on every render from the Baku
 * calendar, so a page left open past midnight rolls over on its next update.
 * Returns { preset, choose, picked, setPicked, range, key } where `key` changes whenever the range does.
 */
export default function useDayRange(initial = 'today') {
  const [preset, setPreset] = useState(initial)
  const [picked, setPicked] = useState('')
  const range = rangeForPreset(preset, undefined, picked)
  return { preset, choose: setPreset, picked, setPicked, range, key: rangeKey(range) }
}
