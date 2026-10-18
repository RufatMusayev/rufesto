import { ATTRIBUTION } from './mapConfig.js'

// Required by OpenFreeMap / OpenMapTiles / OSM: always visible, top-left, small. The links open in a new tab. Styles: canvas.css.
export default function AttributionChip() {
  return (
    <p className="mp-attr">
      {ATTRIBUTION.map((a, i) => (
        <span key={a.href}>
          {i > 0 && ' '}
          <a href={a.href} target="_blank" rel="noopener noreferrer">{a.name}</a>
        </span>
      ))}
    </p>
  )
}
