import { useTranslation } from 'react-i18next'

/**
 * The "my location" button (docs/MAP-PLAN-2026-10-18.md 4, "Location"). `status` is useViewerLocation's:
 *   off / error  outline        a tap asks the browser (the only place that prompts)
 *   asking       ring spinner   aria-busy
 *   on           filled         a tap centres the map on the dot again
 *   denied       slashed        a tap says why it does nothing (the owner shows the notice)
 */
export default function LocateButton({ status, onClick, className = '' }) {
  const { t } = useTranslation('map')
  const on = status === 'on'
  const asking = status === 'asking'
  const denied = status === 'denied'
  return (
    <button
      type="button"
      className={`mp-locate${on ? ' is-on' : ''}${asking ? ' is-asking' : ''}${denied ? ' is-denied' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-label={t('locate')}
      aria-pressed={on}
      aria-busy={asking || undefined}
    >
      {asking ? (
        <span className="mp-locate-spin" aria-hidden="true" />
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
          <line x1="12" y1="1.5" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22.5" />
          <line x1="1.5" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22.5" y2="12" />
          {denied && <line x1="3.5" y1="3.5" x2="20.5" y2="20.5" strokeWidth="2.4" />}
        </svg>
      )}
    </button>
  )
}
