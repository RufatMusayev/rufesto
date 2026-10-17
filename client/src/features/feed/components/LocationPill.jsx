import { useTranslation } from 'react-i18next'

export function PinIcon({ size = 20, filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" fill={filled ? 'var(--bg)' : 'none'} />
    </svg>
  )
}

/**
 * The pin at the right end of the Home tab row (outlined = off, filled = on). Tapping asks the browser; the answer
 * is shared by every tab through useViewerLocation. Renders an empty cell where location is not supported, so the
 * row does not shift while a remembered permission is being used.
 */
export function LocationButton({ geo }) {
  const { t } = useTranslation('social')
  if (!geo.supported) return <span className="soc-htab-geo" aria-hidden="true" />
  const on = geo.status === 'on'
  const asking = geo.status === 'asking'
  const label = on ? t('home.geoOn') : t('home.geoPill')
  return (
    <button
      type="button" className={`icon-btn soc-htab-geo pressable${on ? ' is-on' : ''}`}
      aria-label={label} title={label} aria-pressed={on} disabled={asking || geo.pending}
      onClick={on ? undefined : geo.request}
    >
      {asking ? <span className="spinner" aria-hidden="true" /> : <PinIcon filled={on} />}
    </button>
  )
}

/** One muted line under the tabs: the radius the server used when location is on, or why it is off. */
export default function LocationNote({ geo, radiusKm }) {
  const { t } = useTranslation('social')
  if (!geo.supported || geo.pending) return null
  if (geo.status === 'on') {
    return radiusKm ? <p className="soc-geo-note soc-geo-radius">{t('home.nearby', { km: radiusKm })}</p> : null
  }
  if (geo.status === 'denied') return <p className="soc-geo-note soc-geo-radius" role="status">{t('home.geoDenied')}</p>
  if (geo.status === 'error') return <p className="soc-geo-note soc-geo-radius" role="status">{t('home.geoError')}</p>
  return null
}
