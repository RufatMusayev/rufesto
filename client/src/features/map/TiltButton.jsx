import { useTranslation } from 'react-i18next'

/**
 * The 2D / 3D toggle of detail mode (docs/MAP-PLAN-2026-10-18.md round 2). The screen renders it above the locate button, only
 * while MapCanvas reports onDetail({ available }) (zoom 15 and up), and calls canvasRef.toggleTilt() on click.
 * `tilted`: the map is tilted now, the button offers the way back to flat. Styles: canvas.css (.mp-tilt).
 */
export default function TiltButton({ tilted = false, onClick, className = '' }) {
  const { t } = useTranslation('map')
  const label = tilted ? t('view2d', { defaultValue: '2D view' }) : t('view3d', { defaultValue: '3D view' })
  return (
    <button
      type="button"
      className={`mp-tilt${tilted ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{tilted ? '2D' : '3D'}</span>
    </button>
  )
}
