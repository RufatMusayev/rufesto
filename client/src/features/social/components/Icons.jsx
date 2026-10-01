// Rufesto's own social glyphs: 🤌 for like, fork + knife for comment (never heart / speech bubble).
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

export function LikeIcon({ active = false, size = 26, className = '' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true"
      style={{
        ...base,
        fill: active ? 'var(--accent)' : 'none',
        stroke: active ? 'var(--accent)' : 'currentColor',
        transition: 'fill 120ms, stroke 120ms',
      }}>
      <path d="M8 14c-1.5-1-2.5-2.8-2-4.5.5-1.8 2-2.5 3.5-2s2.5 2 2 3.8c-.3 1-1 1.7-1.8 2" />
      <path d="M9.7 13.3c.8-.3 1.8-.2 2.8.5" />
      <path d="M12.5 13.8c.5-2.5 1.2-5 2-6.5.6-1 1.8-1.2 2.5-.5s.5 2-.2 3.5" />
      <path d="M14 14.5c.8-2 1.5-4 2.2-5.2.5-.8 1.5-1 2.2-.3s.3 1.8-.3 3.2" />
      <path d="M15.2 15c.6-1.5 1.2-3 1.8-4 .4-.7 1.3-.8 1.8-.2s.2 1.5-.3 2.8" />
      <path d="M7.5 15c-.5.8-.8 2-.5 3 .5 1.5 2 2.5 4 2.8s4-.2 5.5-1.5c1-1 1.5-2.5 1.5-4" />
    </svg>
  )
}

export function ForkKnifeIcon({ size = 24 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ ...base, strokeWidth: 1.6 }}>
      <path d="M7 2v8a3 3 0 006 0V2" />
      <path d="M10 2v20" />
      <path d="M17 2v6c0 1.1.9 2 2 2h0c0 1.1-.9 2-2 2v10" />
    </svg>
  )
}

export function ShareIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={base}>
      <path d="M4 13v6a1 1 0 001 1h14a1 1 0 001-1v-6" />
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
    </svg>
  )
}

export function BackIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ ...base, strokeWidth: 2 }}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

export function PlusIcon({ size = 24 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ ...base, strokeWidth: 2.4 }}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function MoreIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
    </svg>
  )
}

export function SendIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={base}>
      <path d="M21 3L10 14" />
      <path d="M21 3l-7 18-4-7-7-4 18-7z" />
    </svg>
  )
}

export function CameraIcon({ size = 28 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ ...base, strokeWidth: 1.6 }}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <circle cx="12" cy="13" r="3" />
      <path d="M9 6l1.5-2h3L15 6" />
    </svg>
  )
}

export function CloseIcon({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ ...base, strokeWidth: 2.2 }}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

export function PeopleIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ ...base, strokeWidth: 1.7 }}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M17.5 14.6c2.3.2 3.9 1.9 3.9 4.4" />
    </svg>
  )
}
