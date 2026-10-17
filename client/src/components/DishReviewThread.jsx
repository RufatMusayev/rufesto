import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { cleanDisplayName, timeAgo } from '../lib/helpers'
import { useAuth } from '../contexts/AuthContext'

const MAX_REPLY = 500            // review_comments_body_max_len (sql/52d)
const PAGE = 50
const COLS = 'id, body, created_at, user_id, users(name, profile_photo)'

/**
 * The replies of one review in the dish sheet: "N replies" (or "Reply" when there are none) is a button that
 * opens the thread and a reply box. Replies live in `review_comments` (sql/24: readable by everyone unless
 * flagged; a signed-in user inserts { review_id, user_id, body } for themselves, body up to 500 characters).
 * `requireAuth()` (sign-in sheet for a signed-out guest) runs before anything is written.
 * `initialCount` is the reply count the review row came with (an embedded count); the thread keeps it in step.
 */
export default function DishReviewThread({ reviewId, initialCount = 0, requireAuth }) {
  const { t, i18n } = useTranslation('restaurant')
  const { session } = useAuth()
  const [count, setCount] = useState(initialCount)
  const [open, setOpen] = useState(false)
  const [replies, setReplies] = useState(null)         // null = not read yet
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sending = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  async function load() {
    setLoading(true)
    setLoadFailed(false)
    const { data, error: err } = await supabase
      .from('review_comments').select(COLS)
      .eq('review_id', reviewId).eq('is_flagged', false)
      .order('created_at', { ascending: true }).limit(PAGE)
    if (!alive.current) return
    setLoading(false)
    if (err) { setLoadFailed(true); return }
    setReplies(data || [])
    setCount(prev => Math.max(prev, (data || []).length))
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && replies === null && !loading) load()
  }

  async function send(e) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending.current) return
    if (!requireAuth()) return
    sending.current = true
    setBusy(true)
    setError('')
    const { data, error: err } = await supabase
      .from('review_comments')
      .insert({ review_id: reviewId, user_id: session.user.id, body })
      .select(COLS).single()
    sending.current = false
    if (!alive.current) return
    setBusy(false)
    if (err || !data) { setError(t('dish.replyFailed')); return }
    setReplies(prev => [...(prev || []), data])
    setCount(c => c + 1)
    setDraft('')
  }

  const label = count > 0 ? t('dish.replies', { count }) : t('dish.reply')
  const panelId = `dds-thread-${reviewId}`

  return (
    <div className="dds-thread">
      <button
        type="button" className="dds-replies-btn" onClick={toggle}
        aria-expanded={open} aria-controls={panelId}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className={`dds-replies-chev${open ? ' is-open' : ''}`}>
          <path d="M8 11L3 6h10l-5 5z" fill="currentColor" />
        </svg>
        {open && count > 0 ? t('dish.hideReplies') : label}
      </button>

      {open ? (
        <div id={panelId} className="dds-thread-panel">
          {loading ? <div className="skeleton dds-thread-sk" aria-busy="true" /> : null}
          {loadFailed ? (
            <p className="dds-thread-note" role="alert">
              {t('dish.repliesFailed')}{' '}
              <button type="button" className="dds-link" onClick={load}>{t('dish.retry')}</button>
            </p>
          ) : null}
          {replies?.length ? (
            <ul className="dds-reply-list">
              {replies.map(r => (
                <li key={r.id} className="dds-reply">
                  <span className="dds-reply-avatar" aria-hidden="true">{(cleanDisplayName(r.users?.name) || 'A')[0].toUpperCase()}</span>
                  <div className="dds-reply-main">
                    <div className="dds-reply-head">
                      <span className="dds-reply-name">{cleanDisplayName(r.users?.name)}</span>
                      <span className="dds-reply-time">{timeAgo(r.created_at, i18n.language)}</span>
                    </div>
                    {r.body ? <p className="dds-reply-body">{r.body}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          <form className="dds-reply-form" onSubmit={send}>
            <input
              className="input dds-reply-input" value={draft} maxLength={MAX_REPLY}
              placeholder={t('dish.replyPlaceholder')} aria-label={t('dish.replyPlaceholder')}
              onChange={e => setDraft(e.target.value)}
            />
            <button type="submit" className="btn btn-primary dds-reply-send" disabled={busy || !draft.trim()}>
              {busy ? <span className="spinner" aria-hidden="true" /> : t('dish.replySend')}
            </button>
          </form>
          {error ? <p className="dds-thread-note dds-thread-error" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
