import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../../../components/ui'
import { useAuth } from '../../../contexts/AuthContext'

const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/
const FORM_ID = 'pf-edit-form'

/** Small sheet to change the display name and phone. The email is shown read-only (only the guest sees it). */
export default function EditProfileSheet({ open, onClose, profile, email }) {
  const { t } = useTranslation(['profile', 'common'])
  const { updateProfile } = useAuth()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(profile?.name || '')
    setPhone(profile?.phone || '')
    setError('')
    setSaving(false)
  }, [open, profile?.name, profile?.phone])

  async function submit(e) {
    e.preventDefault()
    if (saving) return
    const cleanName = name.trim()
    const cleanPhone = phone.trim()
    if (!cleanName) { setError(t('profile:errNameRequired')); return }
    if (cleanPhone && !PHONE_REGEX.test(cleanPhone)) { setError(t('profile:errInvalidPhone')); return }
    setError('')
    setSaving(true)
    const res = await updateProfile({ name: cleanName, phone: cleanPhone || null })
    setSaving(false)
    if (!res || res.error) { setError(t('profile:errSaveFailed')); return }
    onClose()
  }

  return (
    <Sheet
      open={open} onClose={onClose} title={t('profile:editTitle')}
      footer={(
        <div className="pf-sheet-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>{t('common:cancel')}</button>
          <button type="submit" form={FORM_ID} className="btn btn-primary" disabled={saving}>
            {saving ? t('common:saving') : t('common:save')}
          </button>
        </div>
      )}
    >
      <form id={FORM_ID} className="pf-form" onSubmit={submit} noValidate>
        <div>
          <label className="label" htmlFor="pf-name">{t('profile:name')}</label>
          <input
            id="pf-name" className="input" value={name} maxLength={80} autoComplete="name"
            onChange={e => setName(e.target.value)} placeholder={t('profile:name')}
          />
        </div>
        <div>
          <label className="label" htmlFor="pf-phone">{t('profile:phone')}</label>
          <input
            id="pf-phone" className="input" type="tel" value={phone} autoComplete="tel"
            onChange={e => setPhone(e.target.value)} placeholder="+994 50 123 4567"
          />
        </div>
        {email ? (
          <div>
            <div className="label">{t('profile:email')}</div>
            <div className="pf-readonly">{email}</div>
            <p className="pf-hint">{t('profile:emailPrivate')}</p>
          </div>
        ) : null}
        {error ? <p className="pf-error" role="alert">{error}</p> : null}
      </form>
    </Sheet>
  )
}
