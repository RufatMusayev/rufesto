import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../../../components/ui'
import { sendFeedback } from '../api'

/** "Share feedback" form in a sheet (feedback table). Works signed out too: no account needed. */
export default function FeedbackSheet({ open, onClose, userId, defaultName, defaultEmail }) {
  const { t } = useTranslation('profile')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [rating, setRating] = useState(0)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(defaultName || '')
    setEmail(defaultEmail || '')
    setMessage('')
    setRating(0)
    setError('')
    setSending(false)
    setDone(false)
  }, [open, defaultName, defaultEmail])

  async function submit(e) {
    e.preventDefault()
    if (sending) return
    if (!name.trim()) return setError(t('errNameRequired'))
    if (!rating) return setError(t('errSelectRating'))
    if (!message.trim()) return setError(t('errWriteMessage'))
    setError('')
    setSending(true)
    const { error: err } = await sendFeedback({
      userId, name: name.trim(), email: email.trim(), message: message.trim(), rating,
    })
    setSending(false)
    if (err) return setError(t('errSendFailed'))
    setDone(true)
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('shareFeedback')}>
      {done ? (
        <div className="pf-thanks" role="status">
          <div className="pf-thanks-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="state-title">{t('feedbackThanks')}</div>
          <p className="state-body">{t('feedbackThanksHint')}</p>
          <button type="button" className="btn btn-ghost" onClick={() => setDone(false)}>{t('sendAnother')}</button>
        </div>
      ) : (
        <form className="pf-form" onSubmit={submit} noValidate>
          <p className="pf-hint pf-hint-top">{userId ? t('feedbackPromptUser') : t('feedbackPromptGuest')}</p>
          <div>
            <label className="label" htmlFor="pf-fb-name">{t('fbName')}</label>
            <input id="pf-fb-name" className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label className="label" htmlFor="pf-fb-email">
              {t('fbEmail')} <span className="pf-optional">{t('fbEmailOptional')}</span>
            </label>
            <input
              id="pf-fb-email" className="input" type="email" value={email} autoComplete="email"
              onChange={e => setEmail(e.target.value)} placeholder={t('fbEmailPlaceholder')}
            />
          </div>
          <div>
            <div className="label" id="pf-fb-rating">{t('fbRating')}</div>
            <div className="pf-rate" role="group" aria-labelledby="pf-fb-rating">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n} type="button" className={`pf-rate-btn${n <= rating ? ' on' : ''}`}
                  aria-label={t('ratingOf', { count: n })} aria-pressed={n === rating}
                  onClick={() => setRating(rating === n ? 0 : n)}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="pf-fb-msg">{t('fbMessage')}</label>
            <textarea
              id="pf-fb-msg" className="input pf-textarea" rows={4} value={message} maxLength={2000}
              onChange={e => setMessage(e.target.value)} placeholder={t('fbMessagePlaceholder')}
            />
          </div>
          {error ? <p className="pf-error" role="alert">{error}</p> : null}
          <button type="submit" className="btn btn-primary pf-block" disabled={sending}>
            {sending ? t('sending') : t('sendFeedback')}
          </button>
        </form>
      )}
    </Sheet>
  )
}
