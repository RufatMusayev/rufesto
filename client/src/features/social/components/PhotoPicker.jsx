import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { prepareImage } from '../lib/image'
import { CameraIcon, CloseIcon } from './Icons'

/**
 * 4:5 photo slot. Tap to pick; the file is downscaled client-side before it is handed over.
 * value: { blob, url } | null. onChange(value | null). onError(i18nKey).
 */
export default function PhotoPicker({ value, onChange, onError, disabled = false }) {
  const { t } = useTranslation('social')
  const input = useRef(null)
  const [working, setWorking] = useState(false)

  // free the object URL when the photo is replaced or the screen closes
  useEffect(() => () => { if (value?.url) URL.revokeObjectURL(value.url) }, [value])

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setWorking(true)
    try {
      onChange(await prepareImage(file))
    } catch (err) {
      onError?.(`social:errors.${err.code || 'not_an_image'}`)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="soc-photo-slot">
      <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
      {value ? (
        <>
          <img src={value.url} alt={t('newPost.previewAlt')} />
          <button type="button" className="soc-photo-clear hit-ext" aria-label={t('newPost.removePhoto')} onClick={() => onChange(null)} disabled={disabled}>
            <CloseIcon size={14} />
          </button>
        </>
      ) : (
        <button type="button" className="soc-photo-empty" onClick={() => input.current?.click()} disabled={disabled || working}>
          {working ? <span className="spinner" aria-hidden="true" /> : <CameraIcon />}
          <span>{working ? t('newPost.processing') : t('newPost.pickPhoto')}</span>
        </button>
      )}
    </div>
  )
}
