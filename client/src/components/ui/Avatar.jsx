import { useEffect, useState } from 'react'
import { cleanDisplayName } from '../../lib/helpers'

// Circle avatar: photo when it loads, otherwise the first letter of the cleaned display name.
// `ring` adds the gold story-ring gradient (.ig-story-ring) around it.
export default function Avatar({ name, src, size = 36, ring = false }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => { setBroken(false) }, [src])

  const initial = (cleanDisplayName(name)[0] || 'A').toUpperCase()
  const showPhoto = !!src && !broken

  const circle = (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: '50%',
        background: 'var(--s3)', color: 'var(--accent)',
        border: ring ? '2px solid var(--bg)' : '1.5px solid var(--border)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.max(10, Math.round(size * 0.4)), fontWeight: 700,
        flexShrink: 0, overflow: 'hidden', lineHeight: 1,
      }}
    >
      {showPhoto
        ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initial}
    </span>
  )

  if (!ring) return circle
  return (
    <span className="ig-story-ring" style={{ display: 'inline-flex', flexShrink: 0 }}>
      {circle}
    </span>
  )
}
