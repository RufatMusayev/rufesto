import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import {
  createPost, uploadPostPhoto, PHOTO_UPLOAD_ENABLED, POST_REQUIRES_RESTAURANT,
} from '../api'
import { rememberHomeTab } from '../homeTab'
import { CameraIcon } from '../components/Icons'
import PhotoPicker from '../components/PhotoPicker'
import RestaurantPicker from '../components/RestaurantPicker'
import SignInCard from '../components/SignInCard'

const MAX_CAPTION = 500

export default function NewPostPage() {
  const { t } = useTranslation(['social', 'common'])
  const navigate = useNavigate()
  const { session, loading: authLoading } = useAuth()
  const [photo, setPhoto] = useState(null)
  const [caption, setCaption] = useState('')
  const [place, setPlace] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const uploaded = useRef({ blob: null, path: null })   // a retry after a failed insert must not upload twice

  const text = caption.trim()
  const [photoOff, setPhotoOff] = useState(!PHOTO_UPLOAD_ENABLED)   // true when the server has no photo bucket
  const needsPhoto = !photoOff
  const ready = (needsPhoto ? !!photo : text.length > 0) && (!POST_REQUIRES_RESTAURANT || !!place)

  function leave() {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/')
  }

  async function submit() {
    if (busy || !ready || !session) return
    setBusy(true)
    setError(null)

    let photoPath = null
    if (photo) {
      if (uploaded.current.blob === photo.blob) {
        photoPath = uploaded.current.path
      } else {
        const up = await uploadPostPhoto(session.user.id, photo.blob)
        if (up.error) {
          // no photo bucket on this server: continue as a caption-only post
          if (up.error.code === 'photo_disabled') { setPhotoOff(true); setPhoto(null) }
          setError(up.error.key)
          setBusy(false)
          return
        }
        uploaded.current = { blob: photo.blob, path: up.data }
        photoPath = up.data
      }
    }

    const res = await createPost({ restaurantId: place?.id, photoPath, caption: text })
    if (res.error) { setError(res.error.key); setBusy(false); return }
    rememberHomeTab('feed')
    navigate('/')
  }

  const bar = (
    <div className="soc-topbar">
      <button type="button" className="btn btn-ghost soc-btn-sm" onClick={leave} disabled={busy}>{t('common:cancel')}</button>
      <h1 className="soc-topbar-title soc-topbar-title-center">{t('newPost.title')}</h1>
      <div className="soc-topbar-right">
        {session && (
          <button type="button" className="btn btn-primary soc-btn-sm" onClick={submit} disabled={!ready || busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            {t('newPost.post')}
          </button>
        )}
      </div>
    </div>
  )

  if (authLoading) {
    return (
      <div className="soc-page">
        {bar}
        <div className="soc-body"><div className="skeleton" style={{ aspectRatio: '4/5', width: '100%', borderRadius: 12 }} /></div>
      </div>
    )
  }
  if (!session) {
    return (
      <div className="soc-page">
        {bar}
        <div className="soc-body"><SignInCard title={t('newPost.signInTitle')} body={t('newPost.signInBody')} /></div>
      </div>
    )
  }

  return (
    <div className="soc-page">
      {bar}
      <form className="soc-body soc-form" onSubmit={e => { e.preventDefault(); submit() }}>
        {!photoOff ? (
          <PhotoPicker value={photo} onChange={p => { setPhoto(p); setError(null) }} onError={setError} disabled={busy} />
        ) : (
          <div className="soc-photo-soon" role="note">
            <CameraIcon />
            <span>{t('newPost.photoSoon')}</span>
          </div>
        )}

        <div>
          <label className="label" htmlFor="soc-caption">{t('newPost.caption')}</label>
          <textarea
            id="soc-caption" className="input soc-textarea" rows={4} maxLength={MAX_CAPTION}
            value={caption} onChange={e => setCaption(e.target.value)} disabled={busy}
            placeholder={t('newPost.captionPlaceholder')}
          />
          <div className="soc-counter" aria-live="off">{caption.length}/{MAX_CAPTION}</div>
        </div>

        <div>
          <span className="label">
            {t('newPost.restaurant')}{POST_REQUIRES_RESTAURANT ? '' : ` · ${t('newPost.optional')}`}
          </span>
          <RestaurantPicker value={place} onChange={setPlace} disabled={busy} />
        </div>

        {error && <p className="soc-error" role="alert">{t(error)}</p>}
        {POST_REQUIRES_RESTAURANT && !place && text.length > 0 && (
          <p className="soc-hint">{t('newPost.restaurantRequired')}</p>
        )}
      </form>
    </div>
  )
}
