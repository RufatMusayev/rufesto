import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { v2Error } from '../errors'
import { prepareImage } from '../lib/image'
import { createRestaurantPost, fetchPostDishes, isDefiniteRejection, removePostPhoto, uploadPostPhoto } from '../postsApi'
import ErrorBanner from './ErrorBanner'

export const MAX_CAPTION = 2000
const NEAR_LIMIT = 1900
const DONE_MS = 3500

// Composer card of the Posts page: optional photo (resized in the browser), caption, optional dish tag, Publish.
// The photo goes to `post-photos` first, then create_restaurant_post gets its path. If the server definitely
// refuses the post the uploaded object is removed again; after a network / unknown failure it is kept (the post
// may exist). `onPublished()` lets the page refresh its list.
export default function PostComposer({ restaurantId, onPublished }) {
  const { t } = useTranslation('v2')
  const uid = useId()
  const fileRef = useRef(null)
  const photoRef = useRef(null)
  const aliveRef = useRef(true)
  const doneTimer = useRef(null)

  const [photo, setPhoto] = useState(null)          // { blob, url }
  const [preparing, setPreparing] = useState(false)
  const [caption, setCaption] = useState('')
  const [dishId, setDishId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [dishes, setDishes] = useState({ list: [], loading: true, error: false })
  const [dishTry, setDishTry] = useState(0)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      clearTimeout(doneTimer.current)
      if (photoRef.current) URL.revokeObjectURL(photoRef.current.url)
    }
  }, [])

  useEffect(() => {
    let live = true
    setDishes(d => ({ ...d, loading: true, error: false }))
    fetchPostDishes(restaurantId).then(res => {
      if (!live) return
      setDishes(res.error ? { list: [], loading: false, error: true } : { list: res.data, loading: false, error: false })
    })
    return () => { live = false }
  }, [restaurantId, dishTry])

  const replacePhoto = useCallback(next => {
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.url)
    photoRef.current = next
    setPhoto(next)
  }, [])

  async function onPick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''                              // picking the same file again must fire onChange
    if (!file) return
    setError(null)
    setPreparing(true)
    try {
      const next = await prepareImage(file)
      if (aliveRef.current) replacePhoto({ blob: next.blob, url: next.url })
      else URL.revokeObjectURL(next.url)
    } catch (err) {
      if (aliveRef.current) setError(err)
    } finally {
      if (aliveRef.current) setPreparing(false)
    }
  }

  const trimmed = caption.trim()
  const canPublish = (!!photo || trimmed.length > 0) && caption.length <= MAX_CAPTION && !busy && !preparing

  async function publish(e) {
    e.preventDefault()
    if (!canPublish) return
    setBusy(true)
    setError(null)
    setDone(false)
    let path = null
    let creating = false                            // true once create_restaurant_post was sent
    try {
      if (photo) {
        const up = await uploadPostPhoto(restaurantId, photo.blob)
        if (up.error) throw up.error
        path = up.data
      }
      creating = true
      const res = await createRestaurantPost({ restaurantId, photoPath: path, caption: trimmed, dishId })
      if (res.error) throw res.error
      if (!aliveRef.current) return
      replacePhoto(null)
      setCaption('')
      setDishId('')
      setDone(true)
      clearTimeout(doneTimer.current)
      doneTimer.current = setTimeout(() => setDone(false), DONE_MS)
      onPublished?.()
    } catch (err) {
      if (creating && !isDefiniteRejection(err)) {
        // Network or unknown failure: the server may have committed the post, so its photo must stay (removing
        // it would leave a live post with a dangling photo). Refresh the list so the user can see whether it
        // exists, and ask them to check before publishing again.
        if (aliveRef.current) setError(Object.assign(new Error('post_unconfirmed'), { cause: err }))
        onPublished?.()
      } else {
        if (path) removePostPhoto(path)             // the server refused the post: do not leave the object behind
        if (aliveRef.current) setError(err)
      }
    } finally {
      if (aliveRef.current) setBusy(false)
    }
  }

  const counterClass = caption.length >= MAX_CAPTION ? ' is-over' : caption.length >= NEAR_LIMIT ? ' is-near' : ''
  const locked = busy || preparing

  return (
    <form className="v2-card v2-composer" onSubmit={publish} aria-labelledby={`${uid}-title`} aria-busy={busy}>
      <h2 id={`${uid}-title`} className="dash-section-title">{t('postsComposerTitle')}</h2>

      <ErrorBanner message={error ? v2Error(error, t) : null} onDismiss={() => setError(null)} />
      {done && <div className="v2-banner v2-banner--ok" role="status">{t('postsPublished')}</div>}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
      {photo ? (
        <div className="v2-composer-photo">
          <img className="v2-composer-preview" src={photo.url} alt={t('postsPreviewAlt')} />
          <div className="v2-composer-photo-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={locked}>
              {preparing && <span className="spinner" aria-hidden="true" />}
              {t('postsChangePhoto')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => replacePhoto(null)} disabled={locked}>
              {t('postsRemovePhoto')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="v2-composer-add" onClick={() => fileRef.current?.click()} disabled={locked}>
          {preparing ? <span className="spinner" aria-hidden="true" /> : <span className="v2-composer-add-icon" aria-hidden="true">📷</span>}
          <span className="v2-composer-add-label">{preparing ? t('postsPreparing') : t('postsAddPhoto')}</span>
          <span className="v2-hint">{t('postsPhotoHint')}</span>
        </button>
      )}

      <div className="v2-field">
        <label className="label" htmlFor={`${uid}-caption`}>{t('postsCaption')}</label>
        <textarea
          id={`${uid}-caption`}
          className="input v2-textarea"
          rows={4}
          maxLength={MAX_CAPTION}
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder={t('postsCaptionPlaceholder')}
          aria-describedby={`${uid}-count`}
          disabled={busy}
        />
        <div id={`${uid}-count`} className={`v2-counter${counterClass}`}>{caption.length} / {MAX_CAPTION}</div>
      </div>

      <div className="v2-field">
        <label className="label" htmlFor={`${uid}-dish`}>{t('postsDish')}</label>
        <select
          id={`${uid}-dish`}
          className="input"
          value={dishId}
          onChange={e => setDishId(e.target.value)}
          disabled={busy || dishes.loading}
        >
          <option value="">{dishes.loading ? t('postsDishesLoading') : t('postsNoDish')}</option>
          {dishes.list.map(d => (
            <option key={d.id} value={d.id}>{d.available ? d.name : `${d.name} · ${t('postsDishSoldOut')}`}</option>
          ))}
        </select>
        {dishes.error ? (
          <span className="v2-hint">
            {t('postsDishesFailed')}{' '}
            <button type="button" className="v2-link-btn" onClick={() => setDishTry(n => n + 1)}>{t('retry')}</button>
          </span>
        ) : (
          <span className="v2-hint">{t('postsDishHint')}</span>
        )}
      </div>

      <div className="v2-composer-actions">
        <button type="submit" className="btn btn-primary" disabled={!canPublish}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? t('postsPublishing') : t('postsPublish')}
        </button>
        {!photo && trimmed.length === 0 && <span className="v2-hint">{t('postsNeedContent')}</span>}
      </div>
    </form>
  )
}
