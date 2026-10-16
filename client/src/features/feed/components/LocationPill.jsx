import { useTranslation } from 'react-i18next'

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  )
}

/**
 * "Use my location for nearby": asks the browser only when tapped. Granted -> a muted line with the
 * radius the server used; denied -> the pill stays (GPS-off mix) with a hint.
 */
export default function LocationPill({ geo, radiusKm }) {
  const { t } = useTranslation('social')
  if (!geo.supported || geo.pending) return null
  if (geo.status === 'on') {
    return radiusKm ? <p className="soc-geo-note soc-geo-radius">{t('home.nearby', { km: radiusKm })}</p> : null
  }
  const asking = geo.status === 'asking'
  return (
    <div className="soc-geo">
      <button type="button" className="soc-geo-pill" onClick={geo.request} disabled={asking}>
        {asking ? <span className="spinner" aria-hidden="true" /> : <PinIcon />}
        {asking ? t('home.geoAsking') : t('home.geoPill')}
      </button>
      {geo.status === 'denied' && <p className="soc-geo-note" role="status">{t('home.geoDenied')}</p>}
      {geo.status === 'error' && <p className="soc-geo-note" role="status">{t('home.geoError')}</p>}
    </div>
  )
}
