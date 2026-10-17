import { useCallback, useEffect, useState } from 'react'
import './img.css'

/**
 * Image with a reserved box and a fade-in (docs/UX-PLAN-2026-10-18.md 6.8).
 *
 *   <Img src alt="" ratio="16/10" | 1.6 fit="cover" priority fallback={<Emoji />} className imgClassName onLoad onError />
 *
 * - `ratio`: aspect ratio of the box ("16/10", "1/1" or a number). Without it the box takes the size its parent
 *   gives it (width/height 100%), so a CSS class on `className` can size it.
 * - The box is --s3 until the photo has loaded; the <img> fades from opacity 0 to 1 in 200 ms on load (also when it
 *   was already complete at mount, e.g. from the cache). `loading="lazy"` and `decoding="async"` by default;
 *   `priority` makes it eager with fetchpriority=high (lowercase attribute: React 18.3 does not know the camelCase prop) (the first photo above the fold).
 * - No src, or the photo failed to load: `fallback` fills the box (a node; null shows the bare box).
 */
export default function Img({
  src, alt = '', ratio, fit = 'cover', priority = false, fallback = null,
  className = '', imgClassName = '', sizes, srcSet, onLoad, onError,
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => { setLoaded(false); setFailed(false) }, [src])

  // already in the cache when React attaches it: onLoad may have fired before the handler existed
  const ref = useCallback(node => {
    if (node && node.complete && node.naturalWidth > 0) setLoaded(true)
  }, [])

  const showImg = !!src && !failed
  return (
    <span
      className={`ui-img${loaded ? ' is-loaded' : ''}${className ? ` ${className}` : ''}`}
      style={ratio ? { aspectRatio: String(ratio).replace('/', ' / ') } : undefined}
    >
      {showImg ? (
        <img
          ref={ref}
          className={`ui-img-el ui-img-${fit}${imgClassName ? ` ${imgClassName}` : ''}`}
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchpriority={priority ? 'high' : undefined}
          decoding="async"
          onLoad={e => { setLoaded(true); onLoad?.(e) }}
          onError={e => { setFailed(true); onError?.(e) }}
        />
      ) : fallback}
    </span>
  )
}
