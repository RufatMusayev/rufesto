import { useState } from 'react'
import { presetRange, rangeProblem } from '../dates'

/**
 * Range filter shared by the tips screens: Today / This week / This month
 * (Baku calendar) or a custom pair of dates. `range` is { from, to } as
 * 'YYYY-MM-DD'; `problem` ('incomplete' | 'order' | 'long') is set while a custom
 * pair can't be sent, `valid` is then false and pages skip the request. The
 * preset ranges are recomputed each render, so a page left open past midnight
 * rolls over on its next update.
 */
export default function useTipRange(initial = 'today') {
  const [preset, setPreset] = useState(initial)
  const [custom, setCustom] = useState(() => presetRange(initial))
  const range = preset === 'custom' ? custom : presetRange(preset)

  function choose(next) {
    // "Custom" starts from the range that is on screen, so it is valid straight away.
    if (next === 'custom' && preset !== 'custom') setCustom(presetRange(preset))
    setPreset(next)
  }

  const problem = rangeProblem(range)
  return { preset, choose, custom, setCustom, range, problem, valid: problem === null }
}
