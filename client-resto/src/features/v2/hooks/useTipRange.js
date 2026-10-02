import { useState } from 'react'
import { presetRange, rangeProblem } from '../dates'

/**
 * Range filter shared by the tips screens: Today / This week / This month
 * (Baku calendar) or a custom pair of dates. `range` is { from, to } as
 * 'YYYY-MM-DD'; `problem` ('order' | 'long') is set while a custom pair can't
 * be sent, `valid` is then false and pages skip the request. An empty date
 * field is "not set", not an error: the screen keeps the last complete valid
 * range until both fields hold a date again (`custom` is what the inputs show,
 * `range` is what the screen asks for). The preset ranges are recomputed each
 * render, so a page left open past midnight rolls over on its next update.
 */
export default function useTipRange(initial = 'today') {
  const [preset, setPreset] = useState(initial)
  const [custom, setCustomRaw] = useState(() => presetRange(initial))
  const [applied, setApplied] = useState(() => presetRange(initial)) // last complete, valid custom range

  function setCustom(update) {
    const next = typeof update === 'function' ? update(custom) : update
    setCustomRaw(next)
    if (rangeProblem(next) === null) setApplied(next)
  }

  function choose(next) {
    // "Custom" starts from the range that is on screen, so it is valid straight away.
    if (next === 'custom' && preset !== 'custom') {
      const shown = presetRange(preset)
      setCustomRaw(shown)
      setApplied(shown)
    }
    setPreset(next)
  }

  const incomplete = preset === 'custom' && rangeProblem(custom) === 'incomplete'
  const range = preset !== 'custom' ? presetRange(preset) : incomplete ? applied : custom
  const problem = rangeProblem(range)
  return { preset, choose, custom, setCustom, range, problem, valid: problem === null }
}
