import { useTranslation } from 'react-i18next'

export const NOTE_MAX = 200

/**
 * Step 3 fields: host name, phone, optional note and the required consent checkbox.
 * `values` = { name, phone, note, consent }; `errors` = { name?, phone?, consent? } (i18n keys under `bookings`).
 */
export default function ConfirmForm({ values, errors, disabled, onChange }) {
  const { t } = useTranslation('bookings')
  const set = key => e => onChange({ ...values, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <div className="bk-form">
      <div>
        <label className="label" htmlFor="bk-name">{t('form.name')}</label>
        <input
          id="bk-name" className="input" type="text" autoComplete="name" maxLength={80}
          value={values.name} onChange={set('name')} disabled={disabled}
          aria-invalid={!!errors.name} aria-describedby={errors.name ? 'bk-name-err' : undefined}
        />
        {errors.name ? <p id="bk-name-err" className="bk-error" role="alert">{t(errors.name)}</p> : null}
      </div>

      <div>
        <label className="label" htmlFor="bk-phone">{t('form.phone')}</label>
        <input
          id="bk-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" maxLength={20}
          value={values.phone} onChange={set('phone')} disabled={disabled} placeholder="+994 50 123 45 67"
          aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'bk-phone-err' : undefined}
        />
        {errors.phone ? <p id="bk-phone-err" className="bk-error" role="alert">{t(errors.phone)}</p> : null}
      </div>

      <div>
        <label className="label" htmlFor="bk-note">{t('form.note')}</label>
        <textarea
          id="bk-note" className="input bk-textarea" rows={3} maxLength={NOTE_MAX}
          value={values.note} onChange={set('note')} disabled={disabled}
          placeholder={t('form.notePlaceholder')}
        />
        <div className="bk-counter font-mono" aria-hidden="true">{values.note.length}/{NOTE_MAX}</div>
      </div>

      <div>
        <label className="bk-check">
          <input
            type="checkbox" checked={values.consent} onChange={set('consent')} disabled={disabled}
            aria-invalid={!!errors.consent} aria-describedby={errors.consent ? 'bk-consent-err' : undefined}
          />
          <span>{t('form.consent')}</span>
        </label>
        {errors.consent ? <p id="bk-consent-err" className="bk-error" role="alert">{t(errors.consent)}</p> : null}
      </div>
    </div>
  )
}
