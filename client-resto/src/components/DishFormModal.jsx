import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { categoryEmoji } from '@shared/helpers'
import { dishPhotoPath } from '../lib/storage'

const CATEGORIES = ['starter', 'soup', 'salad', 'main', 'side', 'dessert', 'beverage', 'alcoholic', 'kids']

export default function DishFormModal({ dish, sections, restaurantId, onClose, onSaved }) {
  const { t } = useTranslation('dashboard')
  const isEdit = !!dish
  const fileRef = useRef(null)

  const DIETARY = [
    { key: 'is_vegan', label: t('dietaryVegan'), icon: '🌱' },
    { key: 'is_vegetarian', label: t('dietaryVegetarian'), icon: '🥬' },
    { key: 'is_gluten_free', label: t('dietaryGlutenFree'), icon: '🌾' },
    { key: 'is_spicy', label: t('dietarySpicy'), icon: '🌶️' },
  ]

  const [form, setForm] = useState({
    name: dish?.name || '',
    description: dish?.description || '',
    price: dish?.price?.toString() || '',
    category: dish?.category || 'main',
    menu_section_id: dish?.menu_section_id || sections[0]?.id || '',
    is_vegan: dish?.is_vegan || false,
    is_vegetarian: dish?.is_vegetarian || false,
    is_gluten_free: dish?.is_gluten_free || false,
    is_spicy: dish?.is_spicy || false,
    prep_time_min: dish?.prep_time_min?.toString() || '',
    calories: dish?.calories?.toString() || '',
    sort_order: dish?.sort_order?.toString() || '0',
    is_featured: dish?.is_featured || false,
  })

  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(dish?.photo || null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const objectUrlRef = useRef(null)

  useEffect(() => {
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [])

  // Revoke any blob: preview URL we created, whether the modal is saved,
  // cancelled or the photo is cleared before save.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  function update(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setError(t('errPhotoSize'))
      return
    }
    if (!file.type.startsWith('image/')) {
      setError(t('errPhotoType'))
      return
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    setPhotoFile(file)
    setPhotoPreview(url)
    setRemovePhoto(false)
    setError('')
  }

  function handleRemovePhoto() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setPhotoFile(null)
    setPhotoPreview(null)
    setRemovePhoto(true)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSave() {
    if (!form.name.trim()) { setError(t('errNameRequired')); return }
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0) { setError(t('errPriceRequired')); return }
    if (!form.category) { setError(t('errCategoryRequired')); return }
    setSaving(true)
    setError('')

    try {
      const dishId = isEdit ? dish.id : crypto.randomUUID()
      let photoUrl = isEdit ? dish.photo : null

      if (photoFile) {
        const ext = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `${restaurantId}/${dishId}.${ext}`

        if (isEdit && dish.photo) {
          const oldPath = dishPhotoPath(restaurantId, dishId, dish.photo)
          if (oldPath) await supabase.storage.from('dish-photos').remove([oldPath])
        }

        const { error: uploadErr } = await supabase.storage
          .from('dish-photos')
          .upload(path, photoFile, { upsert: true, contentType: photoFile.type })
        if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

        const { data: urlData } = supabase.storage.from('dish-photos').getPublicUrl(path)
        photoUrl = urlData.publicUrl
      } else if (removePhoto && isEdit && dish.photo) {
        const oldPath = dishPhotoPath(restaurantId, dishId, dish.photo)
        if (oldPath) await supabase.storage.from('dish-photos').remove([oldPath])
        photoUrl = null
      }

      const row = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: Number(form.price),
        category: form.category,
        menu_section_id: form.menu_section_id || null,
        is_vegan: form.is_vegan,
        is_vegetarian: form.is_vegetarian,
        is_gluten_free: form.is_gluten_free,
        is_spicy: form.is_spicy,
        prep_time_min: form.prep_time_min ? Number(form.prep_time_min) : null,
        calories: form.calories ? Number(form.calories) : null,
        sort_order: Number(form.sort_order) || 0,
        is_featured: form.is_featured,
        photo: photoUrl,
      }

      if (isEdit) {
        const { error: err } = await supabase.from('dishes').update(row).eq('id', dishId)
        if (err) throw new Error(err.message)
      } else {
        row.id = dishId
        row.restaurant_id = restaurantId
        row.available = true
        const { error: err } = await supabase.from('dishes').insert(row)
        if (err) throw new Error(err.message)
      }

      if (photoUrl && photoFile) {
        const { error: photoErr } = await supabase.from('dish_photos').upsert({
          dish_id: dishId,
          url: photoUrl,
          is_primary: true,
        }, { onConflict: 'dish_id,is_primary' })
        // Non-fatal: the dish row itself already saved. Log and move on so
        // onSaved()/onClose() below still run.
        if (photoErr) console.warn('dish_photos upsert failed:', photoErr.message)
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ padding: '1.25rem 1.25rem 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
              {isEdit ? t('dishFormEditTitle') : t('dishFormAddTitle')}
            </h2>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: 'var(--t3)',
              fontSize: '1.2rem', cursor: 'pointer', padding: 4,
            }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Photo */}
          <div>
            <label className="label">{t('photo')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: 80, height: 80, borderRadius: 10,
                background: 'var(--s3)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0,
              }}>
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '2rem' }}>{categoryEmoji(form.category)}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                  onClick={() => fileRef.current?.click()}>
                  {photoPreview ? t('change') : t('upload')}
                </button>
                {photoPreview && (
                  <button className="btn btn-danger" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                    onClick={handleRemovePhoto}>{t('remove')}</button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="label">{t('name')} *</label>
            <input className="input" value={form.name} onChange={e => update('name', e.target.value)}
              placeholder={t('dishNamePlaceholder')} />
          </div>

          {/* Price */}
          <div>
            <label className="label">{t('priceLabel')} *</label>
            <input className="input" type="number" step="0.01" min="0" value={form.price}
              onChange={e => update('price', e.target.value)} placeholder="0.00" />
          </div>

          {/* Category */}
          <div>
            <label className="label">{t('category')} *</label>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              {CATEGORIES.map(c => (
                <button key={c} className={`chip${form.category === c ? ' active' : ''}`}
                  onClick={() => update('category', c)}
                  style={{ fontSize: '0.72rem', padding: '0.3rem 0.65rem' }}>
                  {categoryEmoji(c)} {t(`cat${c.charAt(0).toUpperCase() + c.slice(1)}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Section */}
          <div>
            <label className="label">{t('menuSection')}</label>
            <select className="input" value={form.menu_section_id}
              onChange={e => update('menu_section_id', e.target.value)}
              style={{ cursor: 'pointer' }}>
              <option value="">{t('none')}</option>
              {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="label">{t('description')}</label>
            <textarea className="input" rows={2} value={form.description}
              onChange={e => update('description', e.target.value)}
              placeholder={t('descDishPlaceholder')} style={{ resize: 'vertical' }} />
          </div>

          {/* Dietary */}
          <div>
            <label className="label">{t('dietary')}</label>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              {DIETARY.map(d => (
                <button key={d.key} className={`chip${form[d.key] ? ' active' : ''}`}
                  onClick={() => update(d.key, !form[d.key])}
                  style={{ fontSize: '0.72rem', padding: '0.3rem 0.65rem' }}>
                  {d.icon} {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Extra details row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label className="label">{t('prepMin')}</label>
              <input className="input" type="number" min="0" value={form.prep_time_min}
                onChange={e => update('prep_time_min', e.target.value)} placeholder="–" />
            </div>
            <div>
              <label className="label">{t('calories')}</label>
              <input className="input" type="number" min="0" value={form.calories}
                onChange={e => update('calories', e.target.value)} placeholder="–" />
            </div>
            <div>
              <label className="label">{t('sortOrder')}</label>
              <input className="input" type="number" min="0" value={form.sort_order}
                onChange={e => update('sort_order', e.target.value)} />
            </div>
          </div>

          {/* Featured */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem' }}>
            <input type="checkbox" checked={form.is_featured}
              onChange={e => update('is_featured', e.target.checked)}
              style={{ accentColor: 'var(--accent)' }} />
            {t('featuredDish')}
          </label>

          {error && <p style={{ color: 'var(--red)', fontSize: '0.78rem' }}>{error}</p>}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>{t('cancel')}</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><span className="spinner" /> {t('saving')}</> : isEdit ? t('saveChanges') : t('addDish')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
