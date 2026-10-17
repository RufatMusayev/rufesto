import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { resignPostPhoto } from '../social/lib/postPhotos'
import { CameraIcon } from '../social/components/Icons'

/**
 * One square of the Posts grid. A photo post shows the (signed) photo; a caption-only post is a text tile in the
 * restaurant's accent colour (colours come from the grid's --rst-tile-bg / --rst-tile-ink). A photo that cannot be
 * shown is re-signed once, then falls back to the camera placeholder. Tap opens the post detail route.
 */
export default function PostTile({ item, onOpen }) {
  const { t } = useTranslation('restaurant')
  const [src, setSrc] = useState(item.photoUrl)
  const [failed, setFailed] = useState(false)
  const retried = useRef(false)

  useEffect(() => { setSrc(item.photoUrl); setFailed(false); retried.current = false }, [item.photoUrl])

  function onError() {
    if (item.photoPath && !retried.current) {
      retried.current = true
      resignPostPhoto(item.photoPath).then(url => { if (url) setSrc(url); else setFailed(true) })
      return
    }
    setFailed(true)
  }

  const text = (item.text || '').trim()
  const label = text ? text.slice(0, 80) : t('posts.openPost')
  const photo = item.hasPhoto
  return (
    <Link
      to={`/post/${item.id}`}
      state={{ item }}
      onClick={onOpen}
      className={`rst-tile${photo ? '' : ' rst-tile--text'}`}
      aria-label={label}
    >
      {photo && src && !failed && (
        <img src={src} alt="" loading="lazy" decoding="async" onError={onError} />
      )}
      {photo && (!src || failed) && (
        <span className="rst-tile-missing" aria-hidden="true"><CameraIcon size={24} /></span>
      )}
      {!photo && <span className="rst-tile-caption">{text}</span>}
    </Link>
  )
}
