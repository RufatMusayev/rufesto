// Small outline glyphs for this feature (kept local; the ui/ primitives have no icon set).
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

export function BackIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ ...base, strokeWidth: 2 }}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

export function MinusIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ ...base, strokeWidth: 2.4 }}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function PlusIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ ...base, strokeWidth: 2.4 }}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function CopyIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={base}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 012-2h9" />
    </svg>
  )
}

export function ShareIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={base}>
      <path d="M4 13v6a1 1 0 001 1h14a1 1 0 001-1v-6" />
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
    </svg>
  )
}

export function CheckIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ ...base, strokeWidth: 2.4 }}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export function PeopleIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ ...base, strokeWidth: 1.7 }}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M17.5 14.6c2.3.2 3.9 1.9 3.9 4.4" />
    </svg>
  )
}
