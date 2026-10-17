import './reviews.css'

// Glyphs of the compact review row. Fill and stroke come from reviews.css (.rv-ico), never from inline styles.
// The like is Rufesto's own 🤌 (never a heart), the reply a fork and knife (never a speech bubble).

export function LikeGlyph({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="rv-ico rv-ico-like" aria-hidden="true">
      <path d="M8 14c-1.5-1-2.5-2.8-2-4.5.5-1.8 2-2.5 3.5-2s2.5 2 2 3.8c-.3 1-1 1.7-1.8 2" />
      <path d="M9.7 13.3c.8-.3 1.8-.2 2.8.5" />
      <path d="M12.5 13.8c.5-2.5 1.2-5 2-6.5.6-1 1.8-1.2 2.5-.5s.5 2-.2 3.5" />
      <path d="M14 14.5c.8-2 1.5-4 2.2-5.2.5-.8 1.5-1 2.2-.3s.3 1.8-.3 3.2" />
      <path d="M15.2 15c.6-1.5 1.2-3 1.8-4 .4-.7 1.3-.8 1.8-.2s.2 1.5-.3 2.8" />
      <path d="M7.5 15c-.5.8-.8 2-.5 3 .5 1.5 2 2.5 4 2.8s4-.2 5.5-1.5c1-1 1.5-2.5 1.5-4" />
    </svg>
  )
}

export function ReplyGlyph({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="rv-ico" aria-hidden="true">
      <path d="M7 2v8a3 3 0 006 0V2" />
      <path d="M10 2v20" />
      <path d="M17 2v6c0 1.1.9 2 2 2h0c0 1.1-.9 2-2 2v10" />
    </svg>
  )
}

/** Check in a circle: "this guest ate there" (reviews.is_verified). 13 px, --sage. */
export function VerifiedGlyph({ size = 13, label }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="rv-verified" role="img" aria-label={label}>
      <title>{label}</title>
      <circle cx="12" cy="12" r="10" />
      <path d="M7.5 12.4l3 3 6-6.4" />
    </svg>
  )
}

export function SendGlyph({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="rv-ico" aria-hidden="true">
      <path d="M21 3L10 14" />
      <path d="M21 3l-7 18-4-7-7-4 18-7z" />
    </svg>
  )
}

export function CloseGlyph({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="rv-ico" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}
