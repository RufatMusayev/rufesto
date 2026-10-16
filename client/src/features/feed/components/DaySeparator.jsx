import { useTranslation } from 'react-i18next'
import { formatDay, relativeDay } from '../lib/days'

/** Small-caps day label of the Friends feed: Today, Yesterday, else the date in the app language. */
export default function DaySeparator({ day }) {
  const { t, i18n } = useTranslation('social')
  const rel = relativeDay(day)
  const label = rel ? t(`feed.${rel}`) : formatDay(day, t)
  return <h3 className="soc-day" lang={i18n.language}>{label}</h3>   // lang: Azerbaijani capitals (i, not dotless)
}
