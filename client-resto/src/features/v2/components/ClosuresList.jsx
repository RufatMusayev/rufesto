import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { bakuDateString, formatCalendarDate } from '../dates'
import { localeTag } from '../../../lib/time'

export const CLOSURE_REASON_MAX = 80

// Upcoming special closures: list with remove, plus an add form. Closures are
// saved the moment they are added or removed (separately from "Save hours").
// `onAdd(date, reason)` and `onRemove(id)` resolve to an error message or ''.
export default function ClosuresList({ closures, onAdd, onRemove }) {
  const { t, i18n } = useTranslation('v2')
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(null)
  const today = bakuDateString()
  const tag = localeTag(i18n.language)

  async function handleAdd(e) {
    e.preventDefault()
    if (busy) return
    const trimmed = reason.trim()
    if (!date || date < today) return setError(t('closureDateInvalid'))
    if (trimmed.length > CLOSURE_REASON_MAX) return setError(t('closureReasonLong', { max: CLOSURE_REASON_MAX }))
    if (closures.some(c => c.date === date)) return setError(t('closureDuplicate'))
    setError('')
    setBusy(true)
    const message = await onAdd(date, trimmed)
    setBusy(false)
    if (message) setError(message)
    else { setDate(''); setReason('') }
  }

  async function handleRemove(id) {
    if (removing) return
    setRemoving(id)
    const message = await onRemove(id)
    setRemoving(null)
    if (message) setError(message)
  }

  return (
    <section className="v2-card" aria-labelledby="v2-closures-title">
      <h2 id="v2-closures-title" className="dash-section-title">{t('closuresTitle')}</h2>

      {closures.length === 0 ? (
        <p className="v2-muted">{t('closuresEmpty')}</p>
      ) : (
        <ul className="v2-closures">
          {closures.map(c => {
            const label = formatCalendarDate(c.date, tag)
            return (
              <li key={c.id} className="v2-closure">
                <span className="v2-closure-date">{label}</span>
                <span className="v2-closure-reason">{c.reason}</span>
                <button
                  type="button"
                  className="v2-icon-btn v2-closure-remove"
                  aria-label={t('removeClosure', { date: label })}
                  disabled={removing === c.id}
                  onClick={() => handleRemove(c.id)}
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <form className="v2-closure-form" onSubmit={handleAdd} noValidate>
        <div className="v2-field">
          <label className="label" htmlFor="v2-closure-date">{t('closureDate')}</label>
          <input id="v2-closure-date" type="date" className="input" min={today} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="v2-field v2-field--grow">
          <label className="label" htmlFor="v2-closure-reason">{t('closureReason')}</label>
          <input
            id="v2-closure-reason"
            type="text"
            className="input"
            maxLength={CLOSURE_REASON_MAX}
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-ghost" disabled={busy || !date}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {t('addClosure')}
        </button>
      </form>
      {error && <div className="v2-field-error" role="alert">{error}</div>}
    </section>
  )
}
