import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '../../../components/ui'
import { SendIcon } from './Icons'

const MAX = 1000

/**
 * Sticky comment box. onSend(body) resolves { error } and the box clears only on success.
 * guard() opens AuthModal for signed-out guests (called on focus), returns true when signed in.
 */
export default function CommentComposer({ me, onSend, guard, inputRef }) {
  const { t } = useTranslation('social')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const text = body.trim()

  async function submit(e) {
    e?.preventDefault()
    if (busy || !text || !guard()) return
    setBusy(true)
    setError(null)
    const { error: err } = await onSend(text)
    setBusy(false)
    if (err) { setError(err.key); return }
    setBody('')
  }

  return (
    <form className="soc-composer" onSubmit={submit}>
      {error && <p className="soc-error soc-composer-error" role="alert">{t(error)}</p>}
      <div className="soc-composer-row">
        <Avatar name={me?.name} src={me?.photo} size={28} />
        <input
          ref={inputRef}
          className="input soc-composer-input"
          type="text"
          value={body}
          maxLength={MAX}
          placeholder={t('comment.placeholder')}
          aria-label={t('comment.placeholder')}
          enterKeyHint="send"
          autoComplete="off"
          onFocus={e => { if (!guard()) e.target.blur() }}
          onChange={e => setBody(e.target.value)}
        />
        <button type="submit" className="icon-btn soc-send" aria-label={t('comment.send')} disabled={busy || !text}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <SendIcon />}
        </button>
      </div>
    </form>
  )
}
