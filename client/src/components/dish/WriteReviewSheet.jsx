import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import BottomSheet from '../ui/BottomSheet'
import { supabase } from '../../lib/supabase'

const MAX_BODY = 1000

/**
 * "Write a review": a small BottomSheet over the dish sheet. Five 40 px stars, a 3-line textarea (1000 characters),
 * "Add photo" and "Post". The same insert as before the redesign (reviews row, optional photo in dish-photos); the reviews
 * section above then refetches (`onPosted`). The sign-in check happens before this opens.
 */
export default function WriteReviewSheet({ open, onClose, dishId, userId, onPosted }) {
  const { t } = useTranslation('menu')
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const file = useRef(null)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  useEffect(() => { if (open) { setRating(0); setBody(''); setError(''); setPhoto(null); setPreview(null) } }, [open])

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    if (!rating) { setError(t('selectRating')); return }
    setError('')
    setBusy(true)
    let photoUrl = null
    if (photo) {
      const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `reviews/${userId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('dish-photos').upload(path, photo)
      if (upErr) { setBusy(false); setError(t('photoUploadFailed', { message: upErr.message })); return }
      photoUrl = supabase.storage.from('dish-photos').getPublicUrl(path).data.publicUrl
    }
    const { error: insErr } = await supabase.from('reviews').insert({
      dish_id: dishId, user_id: userId, rating, body: body.trim() || null, photo: photoUrl,
    })
    setBusy(false)
    if (insErr) { setError(insErr.message); return }
    onPosted?.()
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} size="auto" id="write-review" title={t('dish.writeReview')} dismissible={!busy}>
      <form className="dds-wr" onSubmit={submit}>
        <div className="dds-stars" role="radiogroup" aria-label={t('dish.rating')}>
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n}`}
              className={`dds-star${n <= rating ? ' is-on' : ''}`} onClick={() => setRating(n)}
            >
              {n <= rating ? '★' : '☆'}
            </button>
          ))}
        </div>
        <textarea
          className="dds-wr-text" rows={3} maxLength={MAX_BODY} value={body} onChange={e => setBody(e.target.value)}
          placeholder={t('writeReviewPlaceholder')} aria-label={t('writeReviewPlaceholder')}
        />
        <div className="dds-wr-row">
          <input
            ref={file} type="file" accept="image/*" hidden
            onChange={e => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              setPhoto(f)
              setPreview(URL.createObjectURL(f))
            }}
          />
          {preview ? (
            <span className="dds-wr-photo">
              <img src={preview} alt="" />
              <button type="button" className="dds-wr-x" aria-label={t('removePhoto')} onClick={() => { setPhoto(null); setPreview(null) }}>×</button>
            </span>
          ) : (
            <button type="button" className="btn btn-ghost dds-wr-add" onClick={() => file.current?.click()}>
              <span aria-hidden="true">📷</span> {t('addPhoto')}
            </button>
          )}
          <span className="dds-wr-count">{body.length}/{MAX_BODY}</span>
        </div>
        {error && <p className="dds-wr-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary dds-wr-post" disabled={busy || !rating}>
          {busy ? '…' : t('post')}
        </button>
      </form>
    </BottomSheet>
  )
}
