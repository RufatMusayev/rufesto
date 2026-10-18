// Distance copy of the cards: the server rounds `km` to one decimal, so a place next door arrives as 0 and used to read
// "0 km". Under 100 m the label says so; otherwise one decimal below 10 km, whole kilometres above.
import i18n from '../../../lib/i18n'
import { decimalMark } from '../../../lib/lang'

/** "< 100 m", "0.4 km", "3.2 km", "12 km" (ru: "0,4 км"); null when the distance is unknown. `t` is the `social` translate function. */
export function distanceLabel(t, km) {
  if (km == null || Number.isNaN(Number(km))) return null
  const n = Number(km)
  if (n < 0.1) return t('post.distanceNear')
  const shown = n < 10 ? Number(n.toFixed(1)) : Math.round(n)
  return t('post.kmAway', { km: String(shown).replace('.', decimalMark(i18n.language)) })
}
