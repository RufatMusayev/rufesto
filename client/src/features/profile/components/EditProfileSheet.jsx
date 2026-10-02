import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../../../components/ui'
import { useAuth } from '../../../contexts/AuthContext'
import { PHONE_FORMAT_EXAMPLE, normalizePhone } from '../../../lib/phone'

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
    // The database stores E.164 digits only ("+994501234567"): spaces, dashes and brackets are removed here.
    const cleanPhone = normalizePhone(phone)
    if (!cleanName) { setError(t('profile:errNameRequired')); return }
    if (cleanPhone === null) { setError(t('profile:errInvalidPhone', { example: PHONE_FORMAT_EXAMPLE })); return }
    setError('')
    setSaving(true)
    const res = await updateProfile({ name: cleanName, phone: cleanPhone || null })
    setSaving(false)
    if (res?.error?.code === '23505') { setError(t('profile:errPhoneTaken')); return }      // users_phone_key
    if (res?.error?.code === '23514') { setError(t('profile:errInvalidPhone', { example: PHONE_FORMAT_EXAMPLE })); return }    // users_phone_check
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
            id="pf-phone" className="input" type="tel" inputMode="tel" value={phone} autoComplete="tel"
            aria-describedby="pf-phone-hint" placeholder={PHONE_FORMAT_EXAMPLE}
            onChange={e => setPhone(e.target.value)}
            onBlur={() => { const n = normalizePhone(phone); if (n) setPhone(n) }}
          />
          <p id="pf-phone-hint" className="pf-hint">{t('profile:phoneHint', { example: PHONE_FORMAT_EXAMPLE })}</p>
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
